import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { R2_SECRETS, esKeyValida, firmarLecturaR2 } from "./r2Storage.js";

if (getApps().length === 0) {
  initializeApp();
}

interface FirmarDescargaFacturaData {
  key?: string;
  nombre?: string;
}

const EXPIRACION_SEGUNDOS = 6 * 60 * 60;

/**
 * Firma UNA sola key de R2 con Content-Disposition: attachment, para
 * el botón "Descargar" de la tarjeta de factura -- mismo patrón que
 * ya usa listarReportesCliente.ts para los reportes (url para ver +
 * urlDescarga para forzar la descarga), pero como aquí cada factura
 * se pide bajo demanda (no en un listado por mes), es una función
 * chica aparte en vez de agregarla al firmado en lote de fotos.
 */
export const firmarDescargaFactura = onCall({ secrets: R2_SECRETS }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const snap = await db.doc(`portalUsers/${uid}`).get();
  if (!snap.exists) {
    throw new HttpsError("permission-denied", "Tu cuenta no está vinculada al portal.");
  }

  const key = String(request.data?.key ?? "");
  const nombre = String(request.data?.nombre ?? "factura");
  if (!key || !esKeyValida(key)) {
    throw new HttpsError("invalid-argument", "Key inválida.");
  }

  const url = await firmarLecturaR2(key, EXPIRACION_SEGUNDOS, `${nombre}.pdf`);
  return { url };
});
