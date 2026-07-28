import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { esGerente, esTrabajador } from "./rolesInternos.js";
import { crearSolicitudPendiente } from "./solicitudesAccion.js";

if (getApps().length === 0) {
  initializeApp();
}

interface CrearPanelData {
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

export interface PanelValidado {
  nombre: string;
  tipo: string;
  modalidad: "led" | "lona" | null;
  ciudad: string;
  direccion: string;
  icono: string;
  estado: string;
  lat: number | undefined;
  lng: number | undefined;
  impactoDiario: number | undefined;
}

function validarPanel(data: CrearPanelData): PanelValidado {
  const nombre = limpiar(data.nombre);
  const tipo = limpiar(data.tipo);
  const modalidadRaw = limpiar(data.modalidad);
  const modalidad = modalidadRaw === "led" || modalidadRaw === "lona" ? modalidadRaw : null;
  const ciudad = limpiar(data.ciudad);
  const direccion = limpiar(data.direccion);
  const icono = limpiar(data.icono);
  const estadoRaw = limpiar(data.estado);
  const estado = ESTADOS_VALIDOS.has(estadoRaw) ? estadoRaw : "Disponible";
  const lat = numeroOpcional(data.lat);
  const lng = numeroOpcional(data.lng);
  const impactoDiario = numeroOpcional(data.impactoDiario);

  if (!nombre) {
    throw new HttpsError("invalid-argument", "El nombre del panel es obligatorio.");
  }
  if (!ciudad) {
    throw new HttpsError("invalid-argument", "La ciudad es obligatoria.");
  }

  return { nombre, tipo, modalidad, ciudad, direccion, icono, estado, lat, lng, impactoDiario };
}

/**
 * Crea un panel nuevo (nombre, tipo, ciudad, ubicacion) -- antes solo
 * se podian crear en el sistema aparte (Vista360, lo administra el
 * dueño), y este portal solo los leia para elegirlos al armar un
 * contrato. Con esto el admin puede darlos de alta sin salir de
 * Vista360 Player. Mismo patron de permisos que el resto de acciones
 * sensibles: pasa por Admin SDK, no depende de reglas de Firestore.
 *
 * Se pidió que TODA la gestión del inventario de paneles (crear,
 * editar) quede sujeta a aprobación cuando la hace un Trabajador -- a
 * diferencia de clientes/campañas, acá no se distingue "crear" de
 * "eliminar": el inventario físico es sensible en su totalidad.
 */
export const crearPanel = onCall<CrearPanelData>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  const rol = propio.data()?.role;
  if (!propio.exists || !(esGerente(rol) || esTrabajador(rol))) {
    throw new HttpsError("permission-denied", "Solo el equipo interno puede crear paneles.");
  }

  const panel = validarPanel(request.data);

  if (esTrabajador(rol)) {
    const solicitudId = await crearSolicitudPendiente({
      db,
      tipo: "crearPanel",
      solicitanteUid: uid,
      solicitanteNombre: String(propio.data()?.nombre ?? "Un trabajador"),
      resumen: `Crear el panel "${panel.nombre}" en ${panel.ciudad}.`,
      payload: { ...panel },
    });
    return { ok: true, pendiente: true, solicitudId };
  }

  const id = await ejecutarCrearPanel(db, panel);
  return { id, pendiente: false };
});

export async function ejecutarCrearPanel(db: Firestore, panel: PanelValidado): Promise<string> {
  const panelRef = db.collection("paneles").doc();
  await panelRef.set({
    nombre: panel.nombre,
    tipo: panel.tipo || "Panel",
    ...(panel.modalidad ? { modalidad: panel.modalidad } : {}),
    ciudad: panel.ciudad,
    estado: panel.estado,
    ...(panel.direccion ? { direccion: panel.direccion } : {}),
    ...(panel.lat !== undefined ? { lat: panel.lat } : {}),
    ...(panel.lng !== undefined ? { lng: panel.lng } : {}),
    ...(panel.icono ? { icono: panel.icono } : {}),
    ...(panel.impactoDiario !== undefined ? { impactoDiario: panel.impactoDiario } : {}),
    createdAt: FieldValue.serverTimestamp(),
  });
  return panelRef.id;
}
