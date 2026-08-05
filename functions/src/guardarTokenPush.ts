import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
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
/** Cuantos dispositivos por persona se conservan. Diez es de sobra:
 *  nadie usa diez a la vez, y si alguien vuelve a uno viejo su token se
 *  registra otra vez en cuanto abra la aplicacion. */
const MAX_TOKENS_POR_USUARIO = 10;

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
  const ref = db.doc(`portalUsers/${uid}`);

  // ANTES ESTO ERA arrayUnion(token), Y ERA UNA BOMBA DE TIEMPO.
  //
  // arrayUnion no quita nada nunca. Y los tokens de FCM cambian solos:
  // cada dispositivo nuevo, cada reinstalacion del navegador, cada
  // rotacion que hace Firebase por su cuenta anade uno mas. Los viejos
  // solo se limpian cuando un envio FALLA sobre ellos, que puede tardar
  // meses o no pasar nunca.
  //
  // A donde llevaba: sendEachForMulticast acepta como maximo 500 tokens
  // por llamada. Al pasar de ahi lanza, y las notificaciones de esa
  // persona dejan de funcionar POR COMPLETO -- sin error visible en la
  // aplicacion, porque quien no recibe un aviso no sabe que no lo esta
  // recibiendo. Un usuario activo durante anios llega ahi solo.
  //
  // Ahora se conservan los MAS RECIENTES y se descarta el resto: nadie
  // usa diez dispositivos a la vez, y si vuelve a uno viejo su token se
  // vuelve a registrar en cuanto abra la aplicacion.
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const previos: string[] = Array.isArray(snap.data()?.fcmTokens)
      ? (snap.data()!.fcmTokens as unknown[]).filter((t): t is string => typeof t === "string")
      : [];
    // El token que se acaba de usar va al final (es el mas reciente).
    const sinDuplicados = previos.filter((t) => t !== token);
    const actualizados = [...sinDuplicados, token].slice(-MAX_TOKENS_POR_USUARIO);
    tx.set(ref, { fcmTokens: actualizados }, { merge: true });
  });

  return { ok: true };
});
