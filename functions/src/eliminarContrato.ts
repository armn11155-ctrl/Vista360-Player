import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { R2_SECRETS, borrarObjetoR2 } from "./r2Storage.js";
import { esGerente, esTrabajador } from "./rolesInternos.js";
import { crearSolicitudPendiente } from "./solicitudesAccion.js";

if (getApps().length === 0) {
  initializeApp();
}

interface EliminarContratoData {
  contratoId?: string;
}

/**
 * Elimina una campaña (contrato) -- lo pidió el admin para poder
 * borrar campañas directo desde la lista, con el mismo patrón de
 * permisos que el resto de acciones sensibles (Admin SDK, no depende
 * de reglas de Firestore). De paso libera el panel (vuelve a
 * "Disponible" si estaba "Ocupado" por esta campaña) y borra la foto
 * de portada de R2 si tenía una, para no dejar espacio ocupado sin uso.
 *
 * Un Trabajador puede PEDIR esto, pero no ejecutarlo directo: se pidió
 * que eliminar una campaña quede sujeto a aprobación del Gerente. La
 * lógica de borrado en sí se movió a ejecutarEliminarContrato() para
 * que tanto este endpoint (cuando lo llama el Gerente) como
 * resolverSolicitudAccion.ts (cuando el Gerente aprueba una solicitud
 * de un Trabajador) hagan exactamente lo mismo, sin duplicar código.
 */
export const eliminarContrato = onCall<EliminarContratoData>({ secrets: R2_SECRETS }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  const rol = propio.data()?.role;
  if (!propio.exists || !(esGerente(rol) || esTrabajador(rol))) {
    throw new HttpsError("permission-denied", "Solo el equipo interno puede eliminar campañas.");
  }

  const contratoId = String(request.data?.contratoId ?? "").trim();
  if (!contratoId) {
    throw new HttpsError("invalid-argument", "Falta contratoId.");
  }

  if (esTrabajador(rol)) {
    const contratoSnap = await db.doc(`contratos/${contratoId}`).get();
    if (!contratoSnap.exists) {
      throw new HttpsError("not-found", "No se encontró esa campaña.");
    }
    const nombreCampana = String(contratoSnap.data()?.nombre ?? contratoId);
    const solicitudId = await crearSolicitudPendiente({
      db,
      tipo: "eliminarContrato",
      solicitanteUid: uid,
      solicitanteNombre: String(propio.data()?.nombre ?? "Un trabajador"),
      resumen: `Eliminar la campaña "${nombreCampana}".`,
      payload: { contratoId },
    });
    return { ok: true, pendiente: true, solicitudId };
  }

  await ejecutarEliminarContrato(db, contratoId);
  return { ok: true, pendiente: false };
});

export async function ejecutarEliminarContrato(db: Firestore, contratoId: string): Promise<void> {
  const contratoRef = db.doc(`contratos/${contratoId}`);
  const contratoSnap = await contratoRef.get();
  if (!contratoSnap.exists) {
    throw new HttpsError("not-found", "No se encontró esa campaña.");
  }
  const contrato = contratoSnap.data() ?? {};

  // Campaña multi-panel: libera TODOS los paneles del contrato, no
  // solo el primero (panel_ids incluye al primero cuando existe).
  //
  // OJO: un panel puede estar compartido por VARIOS clientes distintos
  // al mismo tiempo (crearContrato.ts solo bloquea que un mismo
  // cliente se cruce consigo mismo en el mismo panel, no bloquea a
  // otros clientes) -- antes esta funcion marcaba el panel como
  // "Disponible" sin mirar nada mas, asi que borrar la campaña de UN
  // cliente podia liberar por error un panel que en ese mismo momento
  // seguia ocupado por la campaña ACTIVA de otro cliente. Ahora, antes
  // de liberar cada panel, se revisa si queda algun OTRO contrato (no
  // borrado, no este mismo) cuyo rango de fechas incluya hoy y que use
  // ese panel -- si lo hay, el panel se deja "Ocupado" tal como esta.
  const panelIds: string[] = Array.isArray(contrato.panel_ids) && contrato.panel_ids.length > 0
    ? contrato.panel_ids
    : (contrato.panel_id ? [contrato.panel_id] : []);

  const hoy = new Date().toISOString().slice(0, 10);
  await Promise.all(
    panelIds.map(async (panelId) => {
      try {
        const otrosSnap = await db.collection("contratos").where("panel_ids", "array-contains", panelId).get();
        const otrosPorPanelIdSnap = await db.collection("contratos").where("panel_id", "==", panelId).get();
        const todos = new Map<string, FirebaseFirestore.DocumentData>();
        [...otrosSnap.docs, ...otrosPorPanelIdSnap.docs].forEach((d) => todos.set(d.id, d.data()));
        todos.delete(contratoId);
        const siguesUsado = [...todos.values()].some(
          (c) => !c.deleted && typeof c.inicio === "string" && typeof c.fin === "string" && c.inicio <= hoy && hoy <= c.fin
        );
        if (siguesUsado) return;
        await db.doc(`paneles/${panelId}`).set({ estado: "Disponible" }, { merge: true });
      } catch (err) {
        console.error(`No se pudo verificar/liberar el panel ${panelId} al eliminar la campaña.`, err);
      }
    })
  );
  if (typeof contrato.imagenCampaniaUrl === "string" && contrato.imagenCampaniaUrl) {
    await borrarObjetoR2(contrato.imagenCampaniaUrl);
  }

  await contratoRef.delete();
}
