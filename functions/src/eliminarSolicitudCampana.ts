import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { R2_SECRETS, borrarObjetoR2 } from "./r2Storage.js";
import { regenerarResumenCliente } from "./agregadoCliente.js";

if (getApps().length === 0) {
  initializeApp();
}

interface EliminarSolicitudCampanaData {
  solicitudId?: string;
}

/**
 * Elimina de verdad una solicitud de campaña (historial) -- se pidió
 * específicamente esto porque las reglas de Firestore de esta
 * colección no dejan borrar documentos directo desde el cliente (se
 * guarda como historial/auditoría), así que un deleteDoc desde el
 * navegador fallaba en silencio y el registro se quedaba ahí sin
 * avisar nada. Con el Admin SDK (server-side) no depende de esas
 * reglas, igual que eliminarContrato.ts.
 *
 * De paso borra de R2 la imagen referencial y el comprobante de pago
 * si tenía (solo si son keys de R2, no si son URLs http ya migradas /
 * de otra fuente) -- el pedido puntual era liberar espacio, no solo
 * la fila en la base.
 */
export const eliminarSolicitudCampana = onCall<EliminarSolicitudCampanaData>({ secrets: R2_SECRETS }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  if (!propio.exists || propio.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Solo la cuenta admin puede eliminar solicitudes.");
  }

  const solicitudId = String(request.data?.solicitudId ?? "").trim();
  if (!solicitudId) {
    throw new HttpsError("invalid-argument", "Falta solicitudId.");
  }

  const ref = db.doc(`solicitudesCampana/${solicitudId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "No se encontró esa solicitud.");
  }
  const data = snap.data() ?? {};

  const keysR2 = [data.imagenReferencialUrl, data.comprobantePagoUrl].filter(
    (v): v is string => typeof v === "string" && Boolean(v) && !v.startsWith("http")
  );
  await Promise.all(keysR2.map((key) => borrarObjetoR2(key)));

  await ref.delete();

  // El resumen del cliente incluye sus solicitudes.
  await regenerarResumenCliente(db, String(data.cliente_id ?? ""));
  return { ok: true };
});
