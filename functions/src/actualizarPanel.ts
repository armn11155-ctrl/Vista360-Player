import { onCall, HttpsError } from "firebase-functions/v2/https";
import { exigirPersonalInterno } from "./cuentaPortal.js";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { esTrabajador } from "./rolesInternos.js";
import { crearSolicitudPendiente } from "./solicitudesAccion.js";
import { recalcularEstadoPaneles } from "./estadoPaneles.js";

if (getApps().length === 0) {
  initializeApp();
}

interface ActualizarPanelData {
  panelId?: string;
  nombre?: string;
  tipo?: string;
  modalidad?: string;
  ciudad?: string;
  direccion?: string;
  lat?: number | string;
  lng?: number | string;
  estado?: string;
  icono?: string;
  impactoDiario?: number | string;
}

const ESTADOS_VALIDOS = new Set(["Disponible", "Ocupado", "Mantenimiento", "Libre"]);

function limpiar(value?: string) {
  return value?.trim() ?? "";
}

function numeroOpcional(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export interface PanelEditadoValidado {
  panelId: string;
  nombre: string;
  tipo: string;
  modalidad: "led" | "lona" | "unipolar" | null;
  ciudad: string;
  direccion: string;
  icono: string;
  estado: string | undefined;
  lat: number | undefined;
  lng: number | undefined;
  impactoDiario: number | undefined;
}

function validarPanelEditado(data: ActualizarPanelData): PanelEditadoValidado {
  const panelId = limpiar(data.panelId);
  if (!panelId) {
    throw new HttpsError("invalid-argument", "Falta el panel a editar.");
  }
  const nombre = limpiar(data.nombre);
  const tipo = limpiar(data.tipo);
  const modalidadRaw = limpiar(data.modalidad);
  const modalidad = modalidadRaw === "led" || modalidadRaw === "lona" || modalidadRaw === "unipolar" ? modalidadRaw : null;
  const ciudad = limpiar(data.ciudad);
  const direccion = limpiar(data.direccion);
  const icono = limpiar(data.icono);
  const estadoRaw = limpiar(data.estado);
  const estado = ESTADOS_VALIDOS.has(estadoRaw) ? estadoRaw : undefined;
  const lat = numeroOpcional(data.lat);
  const lng = numeroOpcional(data.lng);
  const impactoDiario = numeroOpcional(data.impactoDiario);

  if (!nombre) {
    throw new HttpsError("invalid-argument", "El nombre del panel es obligatorio.");
  }
  if (!ciudad) {
    throw new HttpsError("invalid-argument", "La ciudad es obligatoria.");
  }

  return { panelId, nombre, tipo, modalidad, ciudad, direccion, icono, estado, lat, lng, impactoDiario };
}

/**
 * Edita un panel ya existente (nombre, tipo, ciudad, ubicacion,
 * estado) -- antes de esto solo se podian crear desde Vista360 Player,
 * pero no editar los que ya estaban dados de alta. Mismo patron de
 * permisos que crearPanel.ts: pasa por Admin SDK, no depende de reglas
 * de Firestore.
 *
 * Igual que crearPanel.ts: si lo pide un Trabajador, queda sujeto a
 * aprobación del Gerente en vez de aplicarse directo.
 */
export const actualizarPanel = onCall<ActualizarPanelData>(async (request) => {
  const db = getFirestore();
  const cuenta = await exigirPersonalInterno(request, "Solo el equipo interno puede editar paneles.");
  const rol = cuenta.role;
  const { uid } = cuenta;

  const panel = validarPanelEditado(request.data);

  const panelSnap = await db.doc(`paneles/${panel.panelId}`).get();
  if (!panelSnap.exists) {
    throw new HttpsError("not-found", "No se encontró ese panel.");
  }

  if (esTrabajador(rol)) {
    const solicitudId = await crearSolicitudPendiente({
      db,
      tipo: "actualizarPanel",
      solicitanteUid: uid,
      solicitanteNombre: String(cuenta.nombre || "Un trabajador"),
      resumen: `Editar el panel "${panel.nombre}" (${panel.ciudad}).`,
      payload: { ...panel },
    });
    return { ok: true, pendiente: true, solicitudId };
  }

  await ejecutarActualizarPanel(db, panel);
  return { ok: true, pendiente: false };
});

export async function ejecutarActualizarPanel(db: Firestore, panel: PanelEditadoValidado): Promise<void> {
  const panelRef = db.doc(`paneles/${panel.panelId}`);
  const panelSnap = await panelRef.get();
  if (!panelSnap.exists) {
    throw new HttpsError("not-found", "No se encontró ese panel.");
  }
  await panelRef.set(
    {
      nombre: panel.nombre,
      tipo: panel.tipo || "Panel",
      ...(panel.modalidad ? { modalidad: panel.modalidad } : {}),
      ciudad: panel.ciudad,
      ...(panel.estado ? { estado: panel.estado } : {}),
      direccion: panel.direccion || FieldValue.delete(),
      lat: panel.lat !== undefined ? panel.lat : FieldValue.delete(),
      lng: panel.lng !== undefined ? panel.lng : FieldValue.delete(),
      icono: panel.icono || FieldValue.delete(),
      impactoDiario: panel.impactoDiario !== undefined ? panel.impactoDiario : FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // El formulario de edición manda `estado` como texto suelto (el
  // admin lo elige en un selector) -- eso pisaba sin querer lo que ya
  // había calculado el sistema a partir de los contratos reales (por
  // ejemplo, si el selector quedó mostrando "Disponible" de ANTES de
  // tocar "Sincronizar", guardar el panel por otro motivo -- cambiar
  // el tipo, la ciudad, lo que sea -- lo devolvía a "Disponible" de
  // nuevo, aunque siguiera ocupado de verdad). Recalcular acá cierra
  // ese hueco: Ocupado/Disponible SIEMPRE sale de los contratos
  // vigentes hoy, nunca de lo que haya quedado en el formulario --
  // salvo "Mantenimiento", que sigue siendo 100% manual (ver el check
  // correspondiente dentro de recalcularEstadoPaneles).
  await recalcularEstadoPaneles(db, [panel.panelId]);
}
