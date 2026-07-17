/**
 * create-informes-index-direct.mjs
 *
 * Crea el índice compuesto que necesita la consulta de reportes
 * (informesCliente: where cliente_id== + orderBy mes desc) usando la
 * API directa de Firestore, sin pasar por 'firebase deploy --only
 * firestore:indexes' (mismo patrón que deploy-rules-direct.mjs y
 * set-r2-secrets-direct.mjs: evitamos el chequeo previo de permisos
 * de firebase-tools que la credencial del Admin SDK no siempre pasa).
 */
import { GoogleAuth } from 'google-auth-library';

const PROJECT_ID = 'base-de-datos-vista360';
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

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

const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/collectionGroups/informesCliente/indexes`;

const body = {
  queryScope: 'COLLECTION',
  fields: [
    { fieldPath: 'cliente_id', order: 'ASCENDING' },
    { fieldPath: 'mes', order: 'DESCENDING' },
  ],
};

console.log('Creando índice compuesto para informesCliente (cliente_id + mes)...');
const res = await call(url, 'POST', body);

if (res.ok) {
  console.log('✅ Índice creado (puede tardar unos minutos en quedar listo):', JSON.stringify(res.json, null, 2));
} else if (res.status === 409 || (res.json?.error?.message || '').includes('already exists')) {
  console.log('ℹ️  El índice ya existía, no hay nada que hacer.');
} else {
  console.error(`❌ Error creando el índice (HTTP ${res.status}):`, JSON.stringify(res.json, null, 2));
  process.exit(1);
}
