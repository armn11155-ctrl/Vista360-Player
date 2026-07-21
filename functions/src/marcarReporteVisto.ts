import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) {
  initializeApp();
}

/**
 * Marca un reporte como visto por el cliente -- se llama desde
 * ReportCard.tsx cuando el CLIENTE (no el admin) toca "Ver" o
 * "Descargar". Así el admin puede ver en su lista de reportes si el
 * cliente ya lo revisó o no.
 *
 * El id del reporte (`${clienteId}_${mes}-${dia}`, o `${clienteId}_${mes}`
 * para reportes viejos sin día) es el mismo que usa generarReporteCliente.ts
 * al crear el documento en informesCliente y el que arma
 * listarReportesCliente.ts al listar desde R2 -- por eso alcanza con
 * hacer merge acá, sin depender de que el documento ya exista de
 * antes (algún reporte viejo podría no tener uno todavía).
 *
 * Solo el cliente dueño de esos reportes puede marcarlos como vistos
 * -- ni otro cliente, ni siquiera el admin puede marcar en nombre del
 * cliente (no tendría sentido: "visto por el cliente" solo lo sabe el
 * cliente).
 */
export const marcarReporteVisto = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const clienteId = String(request.data?.clienteId ?? "").trim();
  const informeId = String(request.data?.informeId ?? "").trim();
  if (!clienteId || !informeId || !informeId.startsWith(`${clienteId}_`)) {
    throw new HttpsError("invalid-argument", "Envía clienteId e informeId válidos.");
  }

  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  const propioData = propio.data();
  if (!propio.exists || propioData?.clienteId !== clienteId) {
    throw new HttpsError("permission-denied", "Solo el cliente dueño del reporte puede marcarlo como visto.");
  }

  await db.doc(`informesCliente/${informeId}`).set(
    {
      cliente_id: clienteId,
      vistoPorCliente: true,
      vistoEn: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true };
});
