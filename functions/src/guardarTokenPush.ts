import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (getApps().length === 0) {
  initializeApp();
}

interface GuardarTokenPushData {
  token?: string;
}

/**
 * Guarda el token FCM del dispositivo en portalUsers/{uid}.fcmTokens.
 *
 * Antes esto se hacía con una escritura DIRECTA desde el navegador
 * (updateDoc de Firestore) -- fallaba con "Missing or insufficient
 * permissions" porque las reglas de seguridad de Firestore (que viven
 * fuera de este repo, en la consola de Firebase) no dejan a una cuenta
 * de portal escribir directo en su propio documento. Mismo problema
 * documentado en administrarClienteAdmin.ts y varias otras funciones
 * de este archivo -- la solución consistente en todo este proyecto es
 * pasar la escritura por una Cloud Function con el Admin SDK (que no
 * pasa por esas reglas) en vez de tocar la configuración externa.
 */
export const guardarTokenPush = onCall<GuardarTokenPushData>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const token = String(request.data?.token ?? "").trim();
  if (!token) {
    throw new HttpsError("invalid-argument", "Falta el token.");
  }

  const db = getFirestore();
  await db.doc(`portalUsers/${uid}`).set(
    { fcmTokens: FieldValue.arrayUnion(token) },
    { merge: true }
  );

  return { ok: true };
});
