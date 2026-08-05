import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { esGerente } from "./rolesInternos.js";
import { auditar } from "./registro.js";
import { regenerarAgregadoPaneles } from "./agregadoPaneles.js";

if (getApps().length === 0) {
  initializeApp();
}

interface EliminarPanelData {
  panelId?: string;
}

/**
 * Elimina un panel definitivamente -- a diferencia de crearPanel.ts y
 * actualizarPanel.ts, esto NO pasa por aprobación si lo pide un
 * Trabajador: directamente no lo puede hacer. Pedido explícito ("creo
 * que esta función solo lo puede hacer el gerente"), y tiene sentido
 * porque borrar es irreversible y puede afectar contratos históricos,
 * a diferencia de crear/editar.
 *
 * Antes de borrar, revisa que ningún contrato (activo o pasado) lo
 * tenga referenciado -- si lo dejara borrar igual, esos contratos
 * quedarían apuntando a un panel que ya no existe (reportes, facturas
 * y el detalle del contrato mostrarían datos rotos).
 */
export const eliminarPanel = onCall<EliminarPanelData>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  if (!propio.exists || !esGerente(propio.data()?.role)) {
    throw new HttpsError("permission-denied", "Solo el Gerente puede eliminar paneles.");
  }

  const panelId = (request.data.panelId ?? "").trim();
  if (!panelId) {
    throw new HttpsError("invalid-argument", "Falta el panel a eliminar.");
  }

  const panelRef = db.doc(`paneles/${panelId}`);
  const panelSnap = await panelRef.get();
  if (!panelSnap.exists) {
    throw new HttpsError("not-found", "No se encontró ese panel.");
  }

  // panel_id (un solo panel) o panel_ids (contrato multi-panel) --
  // mismo criterio que ya usa actualizarContrato.ts para saber si un
  // contrato incluye este panel.
  const [porPanelId, contratosSnap] = await Promise.all([
    db.collection("contratos").where("panel_id", "==", panelId).limit(1).get(),
    db.collection("contratos").where("panel_ids", "array-contains", panelId).limit(1).get(),
  ]);
  if (!porPanelId.empty || !contratosSnap.empty) {
    throw new HttpsError(
      "failed-precondition",
      "Este panel tiene contratos asociados (activos o pasados). No se puede eliminar mientras existan -- elimina o reasigna esos contratos primero."
    );
  }

  await panelRef.delete();
  // Excepción: acá no se recalcula estado (el panel ya no existe), así
  // que hay que refrescar el agregado a mano.
  await regenerarAgregadoPaneles(db);
  // Borrar un panel es irreversible y afecta al inventario entero: queda
  // registrado quién lo hizo.
  auditar("panel_eliminado", { uid, objetivoId: panelRef.id });
  return { ok: true };
});
