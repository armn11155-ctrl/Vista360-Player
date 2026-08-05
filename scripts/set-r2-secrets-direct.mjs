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

/**
 * Cuántas versiones de cada secreto se conservan.
 *
 * DOS, Y NO UNA, A PROPÓSITO. Una Cloud Function fija la versión del
 * secreto en el momento de desplegarse. Este script corre ANTES de que
 * las funciones se redesplieguen en el mismo workflow: si se destruyera
 * la versión que las funciones ya desplegadas están usando, quedarían
 * rotas hasta que su redespliegue terminara -- y ese paso tolera fallos.
 * La segunda versión cubre exactamente esa ventana.
 *
 * LO QUE CUESTA ESA SEGURIDAD: el plan gratuito cubre 6 versiones
 * activas al mes. Con 6 secretos, quedarse en una sola versión saldría
 * exactamente gratis; con dos son 12, o sea 6 de más a $0.06 = unos
 * $0.36 al mes. Se paga a propósito: 36 centavos por no arriesgar que
 * las funciones se queden sin secretos.
 */
const VERSIONES_A_CONSERVAR = 2;

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
  const yaEstaba = actual.ok && actual.json?.payload?.data === b64;

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

  // 3) DESTRUIR LAS VERSIONES VIEJAS.
  //
  // Se conservan las VERSIONES_A_CONSERVAR más recientes para poder
  // volver atrás si un valor nuevo estuviera mal. El resto se destruyen:
  // una versión destruida deja de cobrarse.
  //
  // Esto es lo que limpia además todo lo acumulado hasta hoy.
  const lista = await call(
    `https://secretmanager.googleapis.com/v1/projects/${PROJECT_ID}/secrets/${name}/versions?pageSize=100`,
    'GET'
  );
  if (!lista.ok) {
    console.warn(`  ⚠️  No se pudieron listar las versiones de ${name}; se deja como está`);
    continue;
  }
  // Vienen de más nueva a más vieja.
  //
  // OJO CON QUÉ CUENTA COMO "ACTIVA". Google factura las versiones en
  // estado ENABLED **y también las DISABLED**: deshabilitar una NO deja
  // de cobrarla, solo destruirla. Filtrar solo por ENABLED --como hacía
  // la primera versión de este script-- habría dejado las deshabilitadas
  // pagando para siempre, que es justo el problema que se venía a
  // arreglar.
  //
  // Solo DESTROYED deja de costar.
  const facturables = (lista.json.versions ?? []).filter((v) => v.state !== 'DESTROYED');
  const sobran = facturables.slice(VERSIONES_A_CONSERVAR);
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
