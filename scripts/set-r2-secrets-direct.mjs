/**
 * set-r2-secrets-direct.mjs
 *
 * Crea/actualiza los secrets directo por la API de Secret Manager, sin
 * pasar por 'firebase functions:secrets:set' — ese comando hace un
 * chequeo previo de "¿está habilitada la API de Secret Manager?" que
 * necesita un permiso que la credencial del Admin SDK no tiene, aunque
 * sí pueda crear/leer secrets (mismo caso que deploy-rules-direct.mjs
 * con la API de Firestore Rules, en el repo Vista360).
 *
 * Empezó con los 4 de R2; se le sumó CRON_SYNC_SECRET (lo usa
 * sincronizarEstadoPaneles para validar que quien la llama es el cron
 * de GitHub Actions y no cualquiera en internet — ver
 * sincronizar-paneles-diario.yml). Despues se sumo RESEND_API_KEY,
 * que usa enviarCorreoConPdf para mandar correos con PDF adjunto de
 * verdad por la API de Resend.
 */
import { GoogleAuth } from 'google-auth-library';

const PROJECT_ID = 'base-de-datos-vista360';
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// La poda destructiva solo se activa de forma explícita desde el workflow.
// Aun activada, jamás decide por antigüedad a ciegas: conserva `latest` y
// cada versión fijada por una Cloud Function actualmente desplegada.
const DESTRUIR_VERSIONES_OBSOLETAS =
  process.env.DESTRUIR_VERSIONES_OBSOLETAS === 'true';

const SECRETS = {
  R2_ACCOUNT_ID: process.env.VAL_R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: process.env.VAL_R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.VAL_R2_SECRET_ACCESS_KEY,
  R2_BUCKET: process.env.VAL_R2_BUCKET,
  CRON_SYNC_SECRET: process.env.VAL_CRON_SYNC_SECRET,
  // API key de Resend, para que enviarCorreoConPdf pueda mandar el
  // correo con el PDF adjunto de verdad, sin depender de que el admin
  // elija un contacto/app a mano (ver el comentario largo en
  // functions/src/enviarCorreoConPdf.ts). Reemplazo del SMTP de
  // Hotmail que se uso al principio -- una cuenta personal no esta
  // pensada para envio automatizado y arriesgaba que Microsoft la
  // marcara como sospechosa.
  RESEND_API_KEY: process.env.VAL_RESEND_API_KEY,
};

const auth = new GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});
const client = await auth.getClient();
const { token } = await client.getAccessToken();

async function call(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function listarTodas(urlBase, propiedad) {
  const todos = [];
  let pageToken = '';
  do {
    const separador = urlBase.includes('?') ? '&' : '?';
    const url = `${urlBase}${pageToken ? `${separador}pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const pagina = await call(url, 'GET');
    if (!pagina.ok) return { ok: false, status: pagina.status, items: [] };
    todos.push(...(pagina.json?.[propiedad] ?? []));
    pageToken = pagina.json?.nextPageToken ?? '';
  } while (pageToken);
  return { ok: true, status: 200, items: todos };
}

/** Versiones que usa el tráfico de producción AHORA MISMO. */
async function versionesReferenciadasPorProduccion() {
  const funciones = await listarTodas(
    `https://cloudfunctions.googleapis.com/v2/projects/${PROJECT_ID}/locations/-/functions?pageSize=1000`,
    'functions'
  );
  if (!funciones.ok) return { ok: false, status: funciones.status, porSecreto: new Map() };

  const porSecreto = new Map();
  for (const funcion of funciones.items) {
    for (const variable of funcion.serviceConfig?.secretEnvironmentVariables ?? []) {
      const nombre = variable.secret;
      const version = String(variable.version ?? '');
      if (!nombre || !version || version === 'latest') continue;
      const versiones = porSecreto.get(nombre) ?? new Set();
      versiones.add(version);
      porSecreto.set(nombre, versiones);
    }
  }
  return { ok: true, status: 200, porSecreto };
}

// Se consulta una sola vez. Si no se puede demostrar qué usa producción,
// se falla CERRADO: se pueden crear/actualizar valores, pero no se destruye
// ninguna versión.
const referenciasProduccion = await versionesReferenciadasPorProduccion();
if (!referenciasProduccion.ok) {
  console.warn(
    `⚠️  No se pudieron leer las referencias de Cloud Functions (HTTP ${referenciasProduccion.status}); no se destruirá ninguna versión.`
  );
}

let failed = false;

for (const [name, value] of Object.entries(SECRETS)) {
  console.log(`\n— ${name} —`);

  if (!value) {
    console.error(`  ❌ Falta el valor para ${name} (revisa que el secret exista en el repo)`);
    failed = true;
    continue;
  }

  // 1) Crear el secret. Si ya existe (409), no es un error, seguimos.
  const create = await call(
    `https://secretmanager.googleapis.com/v1/projects/${PROJECT_ID}/secrets?secretId=${name}`,
    'POST',
    { replication: { automatic: {} } }
  );
  if (create.ok) {
    console.log(`  ✅ Secret ${name} creado`);
  } else if (create.status === 409) {
    console.log(`  ℹ️  Secret ${name} ya existía, sigo`);
  } else {
    console.error(`  ❌ Error creando ${name} (HTTP ${create.status}):`, JSON.stringify(create.json, null, 2));
    failed = true;
    continue;
  }

  // 2) ¿HACE FALTA UNA VERSIÓN NUEVA?
  //
  // Antes se añadía una SIEMPRE, en cada ejecución del workflow. Y
  // Secret Manager cobra por VERSIÓN ACTIVA (~$0.06 al mes cada una, SKU
  // "Secret version replica storage"). Con 6 secretos, cada despliegue
  // dejaba 6 versiones nuevas pagando para siempre: un cargo que solo
  // sube y nunca baja, sin que nadie lo note hasta ver la factura.
  //
  // Casi siempre el valor NO cambió --se redespliega por el código, no
  // por los secretos-- así que primero se compara con el que ya está.
  const b64 = Buffer.from(value, 'utf-8').toString('base64');
  const actual = await call(
    `https://secretmanager.googleapis.com/v1/projects/${PROJECT_ID}/secrets/${name}/versions/latest:access`,
    'GET'
  );
  // Compara bytes, no la representación textual base64: padding o alfabeto
  // URL-safe distintos pueden representar exactamente el mismo valor.
  const valorActual = actual.ok && actual.json?.payload?.data
    ? Buffer.from(actual.json.payload.data, 'base64')
    : null;
  const yaEstaba = valorActual?.equals(Buffer.from(value, 'utf-8')) === true;

  if (yaEstaba) {
    console.log('  ⏭️  El valor no cambió: no se crea versión nueva');
  } else {
    const addVersion = await call(
      `https://secretmanager.googleapis.com/v1/projects/${PROJECT_ID}/secrets/${name}:addVersion`,
      'POST',
      { payload: { data: b64 } }
    );
    if (addVersion.ok) {
      console.log(`  ✅ Valor guardado (${addVersion.json.name})`);
    } else {
      console.error(`  ❌ Error agregando versión a ${name} (HTTP ${addVersion.status}):`, JSON.stringify(addVersion.json, null, 2));
      failed = true;
      continue;
    }
  }

  // 3) INVENTARIAR (Y, SI SE AUTORIZÓ, DESTRUIR) VERSIONES OBSOLETAS.
  //
  // El primer arreglo de esta lógica pedía solo pageSize=100. Un secreto
  // llegó a la versión 178: se destruyeron las versiones intermedias que
  // aparecían en esa primera página, pero 1..78 jamás se examinaron y
  // siguieron ENABLED y facturando. Por eso esta lectura recorre TODOS los
  // nextPageToken hasta el final.
  const lista = await listarTodas(
    `https://secretmanager.googleapis.com/v1/projects/${PROJECT_ID}/secrets/${name}/versions?pageSize=100`,
    'versions'
  );
  if (!lista.ok) {
    console.warn(`  ⚠️  No se pudieron listar las versiones de ${name}; se deja como está`);
    continue;
  }

  const facturables = lista.items.filter((v) => v.state !== 'DESTROYED');
  const versionId = (v) => String(v.name?.split('/').pop() ?? '');
  const latest = facturables
    .map(versionId)
    .filter(Boolean)
    .sort((a, b) => Number(b) - Number(a))[0];
  const protegidas = new Set(referenciasProduccion.porSecreto.get(name) ?? []);
  if (latest) protegidas.add(latest);
  const sobran = referenciasProduccion.ok
    ? facturables.filter((v) => !protegidas.has(versionId(v)))
    : [];

  console.log(
    `  ℹ️  Facturables=${facturables.length}; protegidas=${[...protegidas].sort((a, b) => Number(a) - Number(b)).join(',') || 'ninguna'}; candidatas=${sobran.length}`
  );
  if (!DESTRUIR_VERSIONES_OBSOLETAS && sobran.length > 0) {
    console.log('  🔎 Solo auditoría: define DESTRUIR_VERSIONES_OBSOLETAS=true para destruir las candidatas verificadas');
    continue;
  }

  for (const v of sobran) {
    const r = await call(`https://secretmanager.googleapis.com/v1/${v.name}:destroy`, 'POST', {});
    if (r.ok) console.log(`  🧹 Versión antigua destruida (${v.name.split('/').pop()})`);
    else console.warn(`  ⚠️  No se pudo destruir ${v.name} (HTTP ${r.status})`);
  }
  if (sobran.length === 0) console.log('  ✅ Sin versiones antiguas que limpiar');
}

if (failed) {
  console.error('\n❌ Algo falló arriba — revisa los errores.');
  process.exit(1);
}

console.log(`\n✅ Los ${Object.keys(SECRETS).length} secrets quedaron configurados en Secret Manager.`);
