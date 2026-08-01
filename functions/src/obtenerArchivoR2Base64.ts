import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { R2_SECRETS, leerObjetoR2 } from "./r2Storage.js";

if (getApps().length === 0) {
  initializeApp();
}

/**
 * Devuelve un archivo de R2 codificado en base64.
 *
 * Para qué: el botón "Compartir por WhatsApp/Correo" de un reporte
 * quiere adjuntar el PDF de verdad (con navigator.share / Web Share
 * API), no solo mandar un link. Para eso el navegador necesita el
 * archivo como Blob -- pero un fetch() directo a la URL firmada de R2
 * desde el navegador queda bloqueado por CORS (el bucket vive en
 * *.r2.cloudflarestorage.com, otro dominio, sin headers CORS de
 * lectura habilitados). Una Cloud Function callable sí puede leer el
 * objeto del lado del servidor (mismo camino que ya usa
 * eliminarReporteCliente) y el propio SDK de Firebase resuelve el
 * CORS de la llamada por su cuenta -- no hace falta tocar nada en R2.
 *
 * Solo admin puede pedir archivos por acá: los botones de compartir
 * por WhatsApp/correo solo existen para el admin en la interfaz, y
 * la key tiene que caer dentro de "clientes/" (el prefijo real que
 * usan los reportes -- ver generarReporteCliente.ts /
 * eliminarReporteCliente.ts) para que esto no se vuelva un proxy de
 * lectura de todo el bucket.
 */
export const obtenerArchivoR2Base64 = onCall({ secrets: R2_SECRETS }, async (request) => {
  try {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const db = getFirestore();
    const propio = await db.doc(`portalUsers/${uid}`).get();
    if (!propio.exists || propio.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "Solo la cuenta admin puede pedir archivos por acá.");
    }

    const key = String(request.data?.key ?? "").trim();
    if (!key || key.includes("..") || key.startsWith("/") || !key.startsWith("clientes/")) {
      throw new HttpsError("invalid-argument", "Key inválida.");
    }

    const buffer = await leerObjetoR2(key);
    return { base64: buffer.toString("base64") };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("Error inesperado al leer archivo de R2.", error);
    const detail = error instanceof Error ? error.message : "Error desconocido";
    throw new HttpsError("internal", `No se pudo leer el archivo: ${detail}`);
  }
});
