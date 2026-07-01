import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getApps, initializeApp } from "firebase-admin/app";

if (getApps().length === 0) {
  initializeApp();
}

// Debe coincidir exactamente con los nombres de View en el Player
// (src/App.tsx). Whitelist estricta a propósito: `pantalla` termina
// como parte de un dot-path en un update() de Firestore
// (`pantallasVisitadas.${pantalla}.count`), así que si aceptáramos
// cualquier string, alguien podría mandar algo como
// "__proto__.role" o un nombre de campo interno para intentar tocar
// datos fuera de pantallasVisitadas. Con la whitelist, el peor caso
// es que la llamada se rechace — nunca se arma un path fuera de esta
// lista cerrada de valores conocidos.
const PANTALLAS_VALIDAS = new Set([
  "inicio",
  "campanas",
  "detalle",
  "evidencias",
  "reportes",
  "perfil",
  "nueva",
  "portafolio",
  "cobertura",
  "mispantallas",
  "impacto",
  "contactanos",
  "analitica",
]);

/**
 * Registra que el cliente autenticado visitó `pantalla` — un contador +
 * la fecha de la última vez. Es la base de "qué mira cada cliente", no
 * solo "cuándo entró" (ver registrarAcceso). Igual que esa función,
 * usa Admin SDK y solo puede tocar el documento del propio uid.
 */
export const registrarVisita = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const pantalla = request.data?.pantalla;
  if (typeof pantalla !== "string" || !PANTALLAS_VALIDAS.has(pantalla)) {
    throw new HttpsError("invalid-argument", "Pantalla no reconocida.");
  }

  const db = getFirestore();
  await db.doc(`portalUsers/${uid}`).update({
    [`pantallasVisitadas.${pantalla}.count`]: FieldValue.increment(1),
    [`pantallasVisitadas.${pantalla}.lastVisit`]: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});
