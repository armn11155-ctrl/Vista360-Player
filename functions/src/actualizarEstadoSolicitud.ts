import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { esPersonalInterno } from "./rolesInternos.js";
import { regenerarResumenCliente } from "./agregadoCliente.js";
import { exigirId } from "./identificadores.js";

if (getApps().length === 0) {
  initializeApp();
}

interface Datos {
  solicitudId?: string;
  estado?: string;
}

/**
 * Cambia el estado de una solicitud de campaña.
 *
 * POR QUÉ EXISTE. Esto lo hacía el navegador directamente con un
 * updateDoc, y las reglas lo permitían acotado a los campos `estado` y
 * `estadoActualizadoEn`. Funcionaba, pero dejaba un camino de escritura
 * FUERA de las Cloud Functions -- y eso impedía guardar las solicitudes
 * en el resumen de cada cliente: en cuanto el admin marcaba una como
 * revisada, el resumen se quedaba desfasado sin que nada se enterara.
 *
 * Pasándolo por acá, TODA escritura sobre solicitudesCampana queda del
 * lado del servidor y el resumen se regenera en el mismo paso. La regla
 * de Firestore se cierra a `allow write: if false`, igual que contratos.
 *
 * Efecto para el cliente: su sesión pasa de 5 lecturas a 4, porque sus
 * solicitudes viajan ya dentro del documento que la sesión pagó.
 */

/** Estados a los que se puede pasar desde la pantalla de Solicitudes.
 *  Lista cerrada a propósito: antes esto lo validaba la regla de
 *  Firestore, y al cerrarla hay que seguir validándolo en algún sitio.
 *  "Convertida" NO está: lo pone crearContrato al convertir la
 *  solicitud en campaña, no una persona desde esta pantalla. */
const ESTADOS_PERMITIDOS = ["Pendiente", "Revisada", "Rechazada"] as const;

export const actualizarEstadoSolicitud = onCall<Datos>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  // Personal interno: la pantalla de Solicitudes la usan Gerente y
  // Trabajador. Un cliente no puede resolver sus propias solicitudes.
  if (!propio.exists || !esPersonalInterno(propio.data()?.role)) {
    throw new HttpsError("permission-denied", "Solo el personal de Vista360 puede resolver solicitudes.");
  }

  const solicitudId = exigirId(request.data?.solicitudId, "solicitudId");
  if (!solicitudId) {
    throw new HttpsError("invalid-argument", "Falta solicitudId.");
  }

  const estado = String(request.data?.estado ?? "").trim();
  if (!(ESTADOS_PERMITIDOS as readonly string[]).includes(estado)) {
    throw new HttpsError("invalid-argument", `Estado no válido: ${estado}`);
  }

  const ref = db.doc(`solicitudesCampana/${solicitudId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "No se encontró esa solicitud.");
  }

  await ref.update({ estado, estadoActualizadoEn: FieldValue.serverTimestamp() });

  // El resumen del cliente incluye sus solicitudes: hay que regenerarlo
  // aquí o el cliente seguiría viendo la suya como pendiente.
  await regenerarResumenCliente(db, String(snap.data()?.cliente_id ?? ""));

  return { ok: true };
});
