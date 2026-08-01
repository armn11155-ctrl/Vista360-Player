/**
 * set-cloud-run-invoker-direct.mjs
 *
 * sincronizarEstadoPaneles tiene `invoker: "public"` en su propia
 * definición (functions/src/sincronizarEstadoPaneles.ts) -- pero para
 * que eso quede aplicado de verdad, alguien tiene que otorgarle el rol
 * "roles/run.invoker" a "allUsers" sobre el servicio de Cloud Run que
 * hay detrás de esa función. Firebase CLI intenta hacerlo solo durante
 * el deploy, pero esa operación (modificar la política de IAM) sigue
 * dando el mismo tipo de error de permisos que ya se vio antes con
 * Cloud Scheduler ("We failed to modify the IAM policy...") -- la
 * cuenta de servicio de GitHub Actions no puede hacer ese cambio
 * usando el camino que usa Firebase CLI.
 *
 * Mismo caso que set-r2-secrets-direct.mjs con Secret Manager: la
 * cuenta SÍ puede hacer el cambio llamando la API de Cloud Run
 * directo (setIamPolicy sobre ESTE servicio puntual, no sobre todo el
 * proyecto) -- lo que no puede es pasar por el chequeo previo, más
 * amplio, que hace Firebase CLI antes de intentarlo.
 *
 * Corre DESPUÉS del paso que despliega sincronizarEstadoPaneles (el
 * servicio de Cloud Run tiene que existir ya).
 */
import { GoogleAuth } from 'google-auth-library';

const PROJECT_ID = 'base-de-datos-vista360';
const REGION = 'us-central1';
const SERVICE = 'sincronizarestadopaneles'; // Cloud Run usa el nombre en minúsculas
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

const auth = new GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});
const client = await auth.getClient();
const { token } = await client.getAccessToken();

const url = `https://run.googleapis.com/v1/projects/${PROJECT_ID}/locations/${REGION}/services/${SERVICE}:setIamPolicy`;

const res = await fetch(url, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    policy: {
      bindings: [{ role: 'roles/run.invoker', members: ['allUsers'] }],
    },
  }),
});
const json = await res.json().catch(() => ({}));

if (res.ok) {
  console.log('✅ roles/run.invoker otorgado a allUsers en el servicio', SERVICE);
} else {
  console.error(`❌ Error otorgando invoker (HTTP ${res.status}):`, JSON.stringify(json, null, 2));
  process.exit(1);
}
