import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getApps, initializeApp } from "firebase-admin/app";

if (getApps().length === 0) {
  initializeApp();
}

/**
 * Registra "última vez que entró" para la cuenta que llama. Se dispara
 * una vez por sesión desde el Player (ver useRegistrarAcceso), justo
 * después de que usePortalAuth confirma que el login fue exitoso.
 *
 * Por qué es una Cloud Function y no un simple updateDoc desde el
 * cliente: las reglas de Firestore de portalUsers solo dejan escribir
 * al dueño (isHuman()), no a las propias cuentas de cliente/admin del
 * portal — y así debe seguir, para no abrir la puerta a que una cuenta
 * de cliente edite su propio rol o clienteId. Esta función usa el Admin
 * SDK (que ignora esas reglas) pero SOLO puede tocar el campo lastLogin
 * del UID que llama — nunca uno pasado por parámetro, para que nadie
 * pueda falsear el acceso de otra cuenta.
 */
export const registrarAcceso = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  await db.doc(`portalUsers/${uid}`).update({
    lastLogin: FieldValue.serverTimestamp(),
    lastLoginCount: FieldValue.increment(1),
  });

  return { ok: true };
});
