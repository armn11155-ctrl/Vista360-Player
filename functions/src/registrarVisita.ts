import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getApps, initializeApp } from "firebase-admin/app";
import { exigirRitmo } from "./limitador.js";

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
 * Registra las pantallas visitadas por el usuario autenticado — contador +
 * fecha de la última vez. Acepta `pantallas` para agrupar una navegación
 * completa en una sola escritura y conserva `pantalla` para clientes que
 * todavía tengan abierta una versión anterior de la PWA.
 * Es la base de "qué mira cada cliente", no
 * solo "cuándo entró" (ver registrarAcceso). Igual que esa función,
 * usa Admin SDK y solo puede tocar el documento del propio uid.
 */
export const registrarVisita = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  // Techo de peticiones por minuto: ver limitador.ts.
  exigirRitmo(uid, "registrarVisita", 60);

  const recibidas: unknown[] = Array.isArray(request.data?.pantallas)
    ? request.data.pantallas
    : [request.data?.pantalla];
  if (
    recibidas.length === 0 ||
    recibidas.length > PANTALLAS_VALIDAS.size ||
    recibidas.some(
      (pantalla: unknown) => typeof pantalla !== "string" || !PANTALLAS_VALIDAS.has(pantalla)
    )
  ) {
    throw new HttpsError("invalid-argument", "Pantalla no reconocida.");
  }

  const pantallas = [...new Set(recibidas as string[])];
  const cambios: Record<string, FieldValue> = {};
  pantallas.forEach((pantalla) => {
    cambios[`pantallasVisitadas.${pantalla}.count`] = FieldValue.increment(1);
    cambios[`pantallasVisitadas.${pantalla}.lastVisit`] = FieldValue.serverTimestamp();
  });

  const db = getFirestore();
  await db.doc(`portalUsers/${uid}`).update(cambios);

  return { ok: true, registradas: pantallas.length };
});
