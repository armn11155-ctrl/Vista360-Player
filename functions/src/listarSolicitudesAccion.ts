import { onCall } from "firebase-functions/v2/https";
import { exigirGerente } from "./cuentaPortal.js";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) {
  initializeApp();
}

/**
 * Lista las solicitudes de acción de los Trabajadores (ver
 * solicitudesAccion.ts) para la pantalla de Aprobaciones del Gerente.
 *
 * Pasa por Cloud Function (no lectura directa de Firestore desde el
 * cliente) por el mismo motivo de siempre en este proyecto: las
 * reglas de seguridad de Firestore viven fuera de este repo, y una
 * colección nueva como esta puede no estar contemplada todavía ahí --
 * mejor no depender de eso para algo que el Gerente necesita ver sí o
 * sí. No es tiempo real (no hace falta: el Gerente entra a revisar,
 * no se queda mirando la pantalla esperando que llegue algo) -- la
 * pantalla vuelve a pedir la lista después de aprobar/rechazar algo.
 */
export const listarSolicitudesAccion = onCall(async (request) => {
  const db = getFirestore();
  await exigirGerente(request, "Solo el Gerente puede ver las solicitudes.");

  const snap = await db.collection("solicitudesAccion").orderBy("createdAt", "desc").limit(200).get();
  const solicitudes = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      tipo: data.tipo ?? "",
      solicitanteNombre: data.solicitanteNombre ?? "",
      estado: data.estado ?? "Pendiente",
      resumen: data.resumen ?? "",
      motivoRechazo: data.motivoRechazo ?? "",
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
      resueltoEn: data.resueltoEn?.toDate ? data.resueltoEn.toDate().toISOString() : null,
    };
  });

  return { solicitudes };
});
