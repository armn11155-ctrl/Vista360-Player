import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) {
  initializeApp();
}

interface ActualizarPanelData {
  panelId?: string;
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
 * Edita un panel ya existente (nombre, tipo, ciudad, ubicacion,
 * estado) -- antes de esto solo se podian crear desde Vista360 Player,
 * pero no editar los que ya estaban dados de alta. Mismo patron de
 * permisos que crearPanel.ts: pasa por Admin SDK, no depende de reglas
 * de Firestore.
 */
export const actualizarPanel = onCall<ActualizarPanelData>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  if (!propio.exists || propio.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Solo la cuenta admin puede editar paneles.");
  }

  const panelId = limpiar(request.data.panelId);
  if (!panelId) {
    throw new HttpsError("invalid-argument", "Falta el panel a editar.");
  }

  const panelRef = db.doc(`paneles/${panelId}`);
  const panelSnap = await panelRef.get();
  if (!panelSnap.exists) {
    throw new HttpsError("not-found", "No se encontró ese panel.");
  }

  const nombre = limpiar(request.data.nombre);
  const tipo = limpiar(request.data.tipo);
  const ciudad = limpiar(request.data.ciudad);
  const direccion = limpiar(request.data.direccion);
  const icono = limpiar(request.data.icono);
  const estadoRaw = limpiar(request.data.estado);
  const estado = ESTADOS_VALIDOS.has(estadoRaw) ? estadoRaw : undefined;
  const lat = numeroOpcional(request.data.lat);
  const lng = numeroOpcional(request.data.lng);
  const impactoDiario = numeroOpcional(request.data.impactoDiario);

  if (!nombre) {
    throw new HttpsError("invalid-argument", "El nombre del panel es obligatorio.");
  }
  if (!ciudad) {
    throw new HttpsError("invalid-argument", "La ciudad es obligatoria.");
  }

  await panelRef.set(
    {
      nombre,
      tipo: tipo || "Panel",
      ciudad,
      ...(estado ? { estado } : {}),
      direccion: direccion || FieldValue.delete(),
      lat: lat !== undefined ? lat : FieldValue.delete(),
      lng: lng !== undefined ? lng : FieldValue.delete(),
      icono: icono || FieldValue.delete(),
      impactoDiario: impactoDiario !== undefined ? impactoDiario : FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true };
});
