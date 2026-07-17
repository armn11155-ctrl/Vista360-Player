/**
 * set-r2-secrets-direct.mjs
 *
 * Crea/actualiza los 4 secrets de R2 directo por la API de Secret
 * Manager, sin pasar por 'firebase functions:secrets:set' — ese
 * comando hace un chequeo previo de "¿está habilitada la API de
 * Secret Manager?" que necesita un permiso que la credencial del
 * Admin SDK no tiene, aunque sí pueda crear/leer secrets (mismo caso
 * que deploy-rules-direct.mjs con la API de Firestore Rules, en el
 * repo Vista360).
 */
import { GoogleAuth } from 'google-auth-library';

const PROJECT_ID = 'base-de-datos-vista360';
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

const SECRETS = {
  R2_ACCOUNT_ID: process.env.VAL_R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: process.env.VAL_R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.VAL_R2_SECRET_ACCESS_KEY,
  R2_BUCKET: process.env.VAL_R2_BUCKET,
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

  // 2) Agregar una versión nueva con el valor real.
  const b64 = Buffer.from(value, 'utf-8').toString('base64');
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
  }
}

if (failed) {
  console.error('\n❌ Algo falló arriba — revisa los errores.');
  process.exit(1);
}

console.log('\n✅ Los 4 secrets de R2 quedaron configurados en Secret Manager.');
