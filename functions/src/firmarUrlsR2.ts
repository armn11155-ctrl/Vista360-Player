import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { R2_SECRETS, esKeyValida, firmarLecturaR2 } from "./r2Storage.js";

if (getApps().length === 0) {
  initializeApp();
}

interface FirmarUrlsR2Data {
  keys?: string[];
}

const MAX_KEYS_POR_LLAMADA = 60;
// 6 horas: suficiente para que el cliente navegue toda la sesión sin
// re-firmar a cada rato, pero sin dejar links "eternos" dando vueltas.
const EXPIRACION_SEGUNDOS = 6 * 60 * 60;

/**
 * Firma URLs de LECTURA (GET) para archivos privados en R2. Quien pide
 * las URLs debe estar autenticado y tener una fila en portalUsers — el
 * verdadero límite de "qué puede ver" ya lo impone Firestore Rules
 * (un cliente solo puede leer sus propios contratos/campañas, así que
 * nunca llega a conocer una key que no sea suya). Esta función solo
 * evita servir cualquier key que no pertenezca a nuestras carpetas.
 */
export const firmarUrlsR2 = onCall({ secrets: R2_SECRETS }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const snap = await db.doc(`portalUsers/${uid}`).get();
  if (!snap.exists) {
    throw new HttpsError("permission-denied", "Tu cuenta no está vinculada al portal.");
  }

  const keysRaw = request.data?.keys;
  if (!Array.isArray(keysRaw) || keysRaw.length === 0) {
    throw new HttpsError("invalid-argument", "Envía un arreglo de keys.");
  }
  if (keysRaw.length > MAX_KEYS_POR_LLAMADA) {
    throw new HttpsError("invalid-argument", `Máximo ${MAX_KEYS_POR_LLAMADA} keys por llamada.`);
  }

  const keys = keysRaw.map((k) => String(k)).filter(esKeyValida);

  const firmadas = await Promise.all(
    keys.map(async (key) => ({
      key,
      url: await firmarLecturaR2(key, EXPIRACION_SEGUNDOS),
    }))
  );

  return { urls: firmadas };
});
