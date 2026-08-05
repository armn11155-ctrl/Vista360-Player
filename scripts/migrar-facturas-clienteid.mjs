/**
 * migrar-facturas-clienteid.mjs
 *
 * Completa el campo `cliente_id` en las facturas antiguas que solo
 * tienen el RUC (`cliente_doc`).
 *
 * PARA QUÉ: hoy la app consulta las facturas DOS veces -- una por RUC y
 * otra por cliente_id -- porque conviven dos formatos: las que generaba
 * el sistema de facturación (solo RUC) y las que crea la app (ambos
 * campos). Como las nuevas tienen los dos, las dos consultas devuelven
 * las mismas facturas: se leen y se pagan dos veces, y luego se
 * descartan los duplicados en memoria.
 *
 * Una vez que TODAS tengan cliente_id, se puede quitar la consulta por
 * RUC y el coste de esa pantalla se parte por dos.
 *
 * SEGURIDAD DE LA MIGRACION:
 *  - Por defecto SOLO CUENTA. No escribe nada hasta que se le pasa
 *    --escribir de forma explícita.
 *  - Nunca cambia un cliente_id que ya exista: solo rellena los que
 *    faltan. Si una factura ya está bien, no se toca.
 *  - Si el RUC no corresponde a ningún cliente, la deja como está y la
 *    reporta -- prefiere no adivinar antes que asignar mal una factura.
 *  - Escribe en lotes de 400 (el límite de Firestore es 500).
 */
import { GoogleAuth } from 'google-auth-library';

const PROJECT_ID = 'base-de-datos-vista360';
const ESCRIBIR = process.argv.includes('--escribir');

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const auth = new GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/datastore'],
});
const client = await auth.getClient();
const { token } = await client.getAccessToken();

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`HTTP ${res.status} en ${method} ${url}`);
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }
  return json;
}

/** Trae una colección entera, paginando (Firestore devuelve de a tandas). */
async function traerTodo(coleccion) {
  const docs = [];
  let pageToken = '';
  do {
    const url = `${BASE}/${coleccion}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const r = await api(url);
    (r.documents ?? []).forEach((d) => docs.push(d));
    pageToken = r.nextPageToken ?? '';
  } while (pageToken);
  return docs;
}

const valor = (campo) =>
  campo?.stringValue ?? campo?.integerValue ?? campo?.doubleValue ?? campo?.booleanValue ?? null;
const idDe = (doc) => doc.name.split('/').pop();

console.log('Leyendo clientes...');
const clientes = await traerTodo('clientes');
const clientePorRuc = new Map();
for (const c of clientes) {
  const ruc = valor(c.fields?.ruc);
  if (ruc) clientePorRuc.set(String(ruc).trim(), idDe(c));
}
console.log(`  ${clientes.length} clientes, ${clientePorRuc.size} con RUC registrado`);

console.log('Leyendo facturas...');
const facturas = await traerTodo('facturas');
console.log(`  ${facturas.length} facturas en total\n`);

const yaCompletas = [];
const porArreglar = [];
const sinRuc = [];
const rucDesconocido = [];

for (const f of facturas) {
  const clienteId = valor(f.fields?.cliente_id);
  const clienteDoc = valor(f.fields?.cliente_doc);
  if (clienteId) { yaCompletas.push(idDe(f)); continue; }
  if (!clienteDoc) { sinRuc.push(idDe(f)); continue; }
  const destino = clientePorRuc.get(String(clienteDoc).trim());
  if (!destino) { rucDesconocido.push({ id: idDe(f), ruc: clienteDoc }); continue; }
  porArreglar.push({ id: idDe(f), clienteId: destino, ruc: clienteDoc });
}

console.log('════════════════ DIAGNÓSTICO ════════════════');
console.log(`  Ya tienen cliente_id ............ ${yaCompletas.length}`);
console.log(`  Se les puede completar .......... ${porArreglar.length}`);
console.log(`  Sin RUC (no se puede deducir) ... ${sinRuc.length}`);
console.log(`  RUC que no coincide con ningún cliente ... ${rucDesconocido.length}`);
console.log('═════════════════════════════════════════════\n');

if (rucDesconocido.length > 0) {
  console.log('⚠️  Facturas con un RUC que no corresponde a ningún cliente registrado.');
  console.log('   NO se tocan: hay que revisarlas a mano antes de decidir.');
  for (const r of rucDesconocido.slice(0, 20)) console.log(`     - factura ${r.id} (RUC ${r.ruc})`);
  if (rucDesconocido.length > 20) console.log(`     ...y ${rucDesconocido.length - 20} más`);
  console.log();
}

if (sinRuc.length > 0) {
  console.log('⚠️  Facturas sin RUC ni cliente_id: quedan invisibles para el cliente.');
  for (const id of sinRuc.slice(0, 20)) console.log(`     - factura ${id}`);
  console.log();
}

if (porArreglar.length === 0) {
  console.log('✅ No hay nada que migrar.');
  if (rucDesconocido.length === 0 && sinRuc.length === 0) {
    console.log('   TODAS las facturas tienen cliente_id: ya se puede quitar la');
    console.log('   consulta por RUC del frontend (ver useFacturas.ts).');
  }
  process.exit(0);
}

if (!ESCRIBIR) {
  console.log('MODO SOLO LECTURA — no se ha modificado nada.');
  console.log(`Para aplicar los ${porArreglar.length} cambios, vuelve a lanzar el`);
  console.log('workflow marcando la casilla de escritura.');
  console.log('\nMuestra de lo que se haría:');
  for (const f of porArreglar.slice(0, 10)) {
    console.log(`  factura ${f.id}: cliente_id <- ${f.clienteId}  (por RUC ${f.ruc})`);
  }
  process.exit(0);
}

console.log(`Aplicando ${porArreglar.length} cambios...`);
let hechos = 0;
for (let i = 0; i < porArreglar.length; i += 400) {
  const lote = porArreglar.slice(i, i + 400);
  await api(`${BASE}:commit`, 'POST', {
    writes: lote.map((f) => ({
      update: {
        name: `projects/${PROJECT_ID}/databases/(default)/documents/facturas/${f.id}`,
        fields: { cliente_id: { stringValue: f.clienteId } },
      },
      // Solo toca ese campo; el resto de la factura queda intacto.
      updateMask: { fieldPaths: ['cliente_id'] },
      // No crea documentos nuevos: si la factura desapareció mientras
      // corría esto, la operación falla en vez de inventarla.
      currentDocument: { exists: true },
    })),
  });
  hechos += lote.length;
  console.log(`  ${hechos}/${porArreglar.length}`);
}
console.log(`\n✅ Listo: ${hechos} facturas completadas.`);
