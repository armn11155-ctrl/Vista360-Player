import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) {
  initializeApp();
}

interface CrearPanelData {
  nombre?: string;
  tipo?: string;
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

/**
 * Crea un panel nuevo (nombre, tipo, ciudad, ubicacion) -- antes solo
 * se podian crear en el sistema aparte (Vista360, lo administra el
 * dueño), y este portal solo los leia para elegirlos al armar un
 * contrato. Con esto el admin puede darlos de alta sin salir de
 * Vista360 Player. Mismo patron de permisos que el resto de acciones
 * sensibles: pasa por Admin SDK, no depende de reglas de Firestore.
 */
export const crearPanel = onCall<CrearPanelData>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  if (!propio.exists || propio.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Solo la cuenta admin puede crear paneles.");
  }

  const nombre = limpiar(request.data.nombre);
  const tipo = limpiar(request.data.tipo);
  const ciudad = limpiar(request.data.ciudad);
  const direccion = limpiar(request.data.direccion);
  const icono = limpiar(request.data.icono);
  const estadoRaw = limpiar(request.data.estado);
  const estado = ESTADOS_VALIDOS.has(estadoRaw) ? estadoRaw : "Disponible";
  const lat = numeroOpcional(request.data.lat);
  const lng = numeroOpcional(request.data.lng);
  const impactoDiario = numeroOpcional(request.data.impactoDiario);

  if (!nombre) {
    throw new HttpsError("invalid-argument", "El nombre del panel es obligatorio.");
  }
  if (!ciudad) {
    throw new HttpsError("invalid-argument", "La ciudad es obligatoria.");
  }

  const panelRef = db.collection("paneles").doc();
  await panelRef.set({
    nombre,
    tipo: tipo || "Panel",
    ciudad,
    estado,
    ...(direccion ? { direccion } : {}),
    ...(lat !== undefined ? { lat } : {}),
    ...(lng !== undefined ? { lng } : {}),
    ...(icono ? { icono } : {}),
    ...(impactoDiario !== undefined ? { impactoDiario } : {}),
    createdAt: FieldValue.serverTimestamp(),
  });

  return { id: panelRef.id };
});
