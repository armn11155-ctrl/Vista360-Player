import { onCall, HttpsError } from "firebase-functions/v2/https";
import { exigirPersonalInterno } from "./cuentaPortal.js";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { R2_SECRETS, borrarObjetoR2 } from "./r2Storage.js";
import { esTrabajador } from "./rolesInternos.js";
import { crearSolicitudPendiente } from "./solicitudesAccion.js";
import { recalcularEstadoPaneles } from "./estadoPaneles.js";
import { auditar, auditarFallo } from "./registro.js";
import { regenerarAgregadoClientes } from "./agregadoClientes.js";
import { regenerarResumenCliente } from "./agregadoCliente.js";
import { exigirId } from "./identificadores.js";

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
  const db = getFirestore();
  const cuenta = await exigirPersonalInterno(request, "Solo el equipo interno puede eliminar campañas.");
  const rol = cuenta.role;
  const { uid } = cuenta;

  const contratoId = exigirId(request.data?.contratoId, "contratoId");
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
      solicitanteNombre: String(cuenta.nombre || "Un trabajador"),
      resumen: `Eliminar la campaña "${nombreCampana}".`,
      payload: { contratoId },
    });
    return { ok: true, pendiente: true, solicitudId };
  }

  try {
    await ejecutarEliminarContrato(db, contratoId);
  } catch (error) {
    // Se audita el intento fallido igual que el exitoso: si alguien
    // reporta "intenté borrar y no pude", el rastro tiene que existir.
    auditarFallo("contrato_eliminado", error, { uid, rol, objetivoId: contratoId });
    throw error;
  }
  // Queda el rastro de QUIEN borró qué y cuándo. Antes esto se perdía:
  // el contrato desaparecía y no quedaba registro de quién lo pidió.
  auditar("contrato_eliminado", { uid, rol, objetivoId: contratoId });
  // Mantiene al dia el agregado del selector (lista de clientes y su
  // conteo de campanas activas). No lanza: si falla, el selector cae
  // a leer la coleccion directamente.
  await regenerarAgregadoClientes(db);
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
  const panelIds: string[] = Array.isArray(contrato.panel_ids) && contrato.panel_ids.length > 0
    ? contrato.panel_ids
    : (contrato.panel_id ? [contrato.panel_id] : []);

  if (typeof contrato.imagenCampaniaUrl === "string" && contrato.imagenCampaniaUrl) {
    await borrarObjetoR2(contrato.imagenCampaniaUrl);
  }

  await contratoRef.delete();

  // OJO: un panel puede estar compartido por VARIOS clientes distintos
  // a la vez (unipolar, 2 caras) o por otro cliente entero (crearContrato
  // solo bloquea que un mismo cliente se cruce consigo mismo en un panel
  // LED, no bloquea a otros clientes) -- borrar la campaña de UN cliente
  // no necesariamente libera el panel del todo. recalcularEstadoPaneles
  // ya corre DESPUÉS del delete de arriba, así que cuenta de nuevo los
  // contratos que quedan (sin este) contra el cupo real del panel (1 en
  // lona/mural/paradero, 2 en unipolar) -- misma lógica que usan
  // crearContrato y la tarea diaria, para que las tres no queden
  // desalineadas entre sí.
  await recalcularEstadoPaneles(db, panelIds);

  // Resumen del cliente al dia. Va aca dentro y no en el manejador de
  // arriba porque resolverSolicitudAccion tambien llama a esta funcion
  // (cuando un Gerente aprueba el borrado que pidio un Trabajador):
  // poniendolo en el unico sitio que borra de verdad, no hay forma de
  // que un camino se olvide.
  await regenerarResumenCliente(db, String(contrato.cliente_id ?? ""));
}
