/**
 * descargar-reglas-firestore.mjs
 *
 * Descarga las reglas de seguridad que están AHORA MISMO en producción y
 * las escribe en un archivo, para poder compararlas con las del
 * repositorio (firestore.rules).
 *
 * Existe porque las reglas nunca estuvieron versionadas: vivían solo en
 * la consola de Firebase, sin historial ni forma de revisarlas. Sin
 * saber qué dicen, no se puede afirmar que la aplicación sea segura --
 * son la última línea de defensa, la que se aplica aunque alguien llame
 * a Firestore directamente desde la consola del navegador saltándose la
 * aplicación entera.
 *
 * Usa la API de Firebase Rules con la misma credencial del despliegue,
 * y el mismo patrón que los otros scripts de esta carpeta (llamada
 * directa a la API en vez de pasar por firebase-tools, que hace
 * comprobaciones de permisos que esta credencial no siempre supera).
 *
 * NO modifica nada: solo lee.
 */
import { GoogleAuth } from 'google-auth-library';
import { writeFileSync } from 'node:fs';

const PROJECT_ID = 'base-de-datos-vista360';
const SALIDA = process.argv[2] || '/tmp/reglas-en-produccion.rules';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const auth = new GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});
const client = await auth.getClient();
const { token } = await client.getAccessToken();

async function get(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`❌ HTTP ${res.status} en ${url}`);
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }
  return json;
}

// 1. Qué conjunto de reglas está publicado para Firestore.
const release = await get(
  `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/releases/cloud.firestore`
);
const rulesetName = release.rulesetName;
console.log(`Conjunto de reglas publicado: ${rulesetName}`);
console.log(`Publicado el: ${release.createTime ?? '(sin fecha)'}`);

// 2. Su contenido.
const ruleset = await get(`https://firebaserules.googleapis.com/v1/${rulesetName}`);
const archivos = ruleset.source?.files ?? [];
if (archivos.length === 0) {
  console.error('❌ El conjunto de reglas vino vacío.');
  process.exit(1);
}

const contenido = archivos.map((f) => f.content).join('\n');
writeFileSync(SALIDA, contenido, 'utf-8');

console.log(`\n✅ Guardado en ${SALIDA} (${contenido.length} caracteres)\n`);
console.log('──────── REGLAS ACTUALES EN PRODUCCIÓN ────────');
console.log(contenido);
console.log('───────────────────────────────────────────────');

// 3. Aviso automático de los patrones más peligrosos, para que salte a
//    la vista en el log aunque nadie lea las reglas con detalle.
const alertas = [];
if (/allow\s+(read|write)[^:]*:\s*if\s+true/.test(contenido)) {
  alertas.push('Hay una regla ABIERTA A CUALQUIERA (if true).');
}
if (/allow\s+write[^:]*:\s*if\s+request\.auth\s*!=\s*null\s*;/.test(contenido)) {
  alertas.push('Hay una escritura permitida a CUALQUIER usuario autenticado, sin más condiciones.');
}
if (/match\s*\/portalUsers/.test(contenido)) {
  const bloque = contenido.slice(contenido.indexOf('match /portalUsers'));
  const propio = bloque.slice(0, bloque.indexOf('match /', 10) === -1 ? 600 : bloque.indexOf('match /', 10));
  if (/allow\s+(write|update)/.test(propio) && !/allow\s+(write|update)[^:]*:\s*if\s+false/.test(propio)) {
    alertas.push(
      'portalUsers ACEPTA ESCRITURA del cliente. Ahí vive el campo "role": ' +
      'si la regla no acota los campos exactos, un cliente puede escribirse role:"admin" ' +
      'y quedarse con acceso total. REVISAR CON PRIORIDAD.'
    );
  }
}

if (alertas.length > 0) {
  console.log('\n⚠️  ATENCIÓN:');
  for (const a of alertas) console.log(`   - ${a}`);
} else {
  console.log('\nSin patrones peligrosos evidentes en la revisión automática.');
  console.log('(Revisión superficial: no sustituye leer las reglas.)');
}
