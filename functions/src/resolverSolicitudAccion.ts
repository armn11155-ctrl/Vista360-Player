import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { R2_SECRETS } from "./r2Storage.js";
import { esGerente } from "./rolesInternos.js";
import { ejecutarEliminarContrato } from "./eliminarContrato.js";
import { ejecutarEliminarClienteDefinitivo } from "./administrarClienteAdmin.js";
import { ejecutarAdministrarUsuarioPortal } from "./administrarUsuarioPortal.js";
import { ejecutarCrearPanel, type PanelValidado } from "./crearPanel.js";
import { ejecutarActualizarPanel, type PanelEditadoValidado } from "./actualizarPanel.js";
import { exigirId, idOpcional } from "./identificadores.js";

if (getApps().length === 0) {
  initializeApp();
}

interface ResolverSolicitudAccionData {
  solicitudId?: string;
  accion?: "aprobar" | "rechazar";
  motivoRechazo?: string;
}

/**
 * Aprueba o rechaza una solicitud de acción creada por un Trabajador
 * (ver solicitudesAccion.ts y los comentarios en eliminarContrato.ts,
 * administrarClienteAdmin.ts, administrarUsuarioPortal.ts,
 * crearPanel.ts y actualizarPanel.ts, que son las 5 acciones que
 * pueden quedar pendientes). Exclusiva del Gerente.
 *
 * Al aprobar, ejecuta la MISMA función interna que se hubiera
 * ejecutado si el Gerente hubiera hecho la acción directamente (sin
 * pasar por una solicitud) -- no hay dos copias de esa lógica, solo
 * dos formas de llegar a ella.
 */
export const resolverSolicitudAccion = onCall<ResolverSolicitudAccionData>({ secrets: R2_SECRETS }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  if (!propio.exists || !esGerente(propio.data()?.role)) {
    throw new HttpsError("permission-denied", "Solo el Gerente puede aprobar o rechazar solicitudes.");
  }

  const solicitudId = exigirId(request.data?.solicitudId, "solicitudId");
  const accion = request.data?.accion;
  if (!solicitudId) {
    throw new HttpsError("invalid-argument", "Falta la solicitud.");
  }
  if (accion !== "aprobar" && accion !== "rechazar") {
    throw new HttpsError("invalid-argument", "Acción inválida.");
  }

  const ref = db.doc(`solicitudesAccion/${solicitudId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "No se encontró esa solicitud.");
  }
  const solicitud = snap.data()!;
  if (solicitud.estado !== "Pendiente") {
    throw new HttpsError("failed-precondition", "Esta solicitud ya fue resuelta.");
  }

  if (accion === "rechazar") {
    const motivoRechazo = String(request.data?.motivoRechazo ?? "").trim();
    await ref.set(
      { estado: "Rechazada", resueltoPor: uid, resueltoEn: FieldValue.serverTimestamp(), motivoRechazo },
      { merge: true }
    );
    return { ok: true };
  }

  // accion === "aprobar": ejecuta la acción real según el tipo.
  const payload = (solicitud.payload ?? {}) as Record<string, unknown>;
  switch (solicitud.tipo) {
    case "eliminarContrato":
      await ejecutarEliminarContrato(db, String(payload.contratoId ?? ""));
      break;
    case "eliminarClienteDefinitivo":
      await ejecutarEliminarClienteDefinitivo(db, String(payload.clienteId ?? ""));
      break;
    case "eliminarUsuario":
      await ejecutarAdministrarUsuarioPortal(db, {
        invitacionId: String(payload.invitacionId ?? ""),
        uid: payload.uid ? String(payload.uid) : null,
        accion: "eliminar",
      });
      break;
    case "crearPanel":
      await ejecutarCrearPanel(db, payload as unknown as PanelValidado);
      break;
    case "actualizarPanel":
      await ejecutarActualizarPanel(db, payload as unknown as PanelEditadoValidado);
      break;
    default:
      throw new HttpsError("failed-precondition", "Tipo de solicitud desconocido.");
  }

  await ref.set(
    { estado: "Aprobada", resueltoPor: uid, resueltoEn: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { ok: true };
});
