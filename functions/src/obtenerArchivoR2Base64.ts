import { HttpsError, onCall } from "firebase-functions/v2/https";
import { exigirPersonalInterno } from "./cuentaPortal.js";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { R2_SECRETS, leerObjetoR2, esKeyValida } from "./r2Storage.js";

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
 * eliminarReporteCliente.ts) o "vista360/facturas/" (el prefijo que
 * usan las facturas -- ver esCarpetaValida en r2Storage.ts) para que
 * esto no se vuelva un proxy de lectura de todo el bucket.
 */
/** Forma exacta de la key de un reporte (ver generarReporteCliente.ts). */
const FORMATO_REPORTE =
  /^clientes\/([A-Za-z0-9_-]{1,128})\/reportes\/\d{4}-\d{2}\/\d{2}\/[A-Za-z0-9_-]{1,60}\.pdf$/;

/** Forma exacta de la key de una factura (ver nuevaKey en r2Storage.ts). */
const FORMATO_FACTURA = /^vista360\/facturas\/[A-Za-z0-9._-]{1,80}$/;

export const obtenerArchivoR2Base64 = onCall({ secrets: R2_SECRETS }, async (request) => {
  try {
    const db = getFirestore();
    // El Trabajador tambien envia reportes y facturas por Correo/WhatsApp,
    // asi que necesita leer ESOS archivos. Lo que NO se le da -- ni a el ni
    // al Gerente -- es elegir libremente una key: eso se ata abajo.
    await exigirPersonalInterno(
      request,
      "Solo el equipo interno puede pedir archivos por acá."
    );

    const key = String(request.data?.key ?? "").trim();
    // La key entra cruda desde el navegador: se exige que este dentro de
    // una carpeta conocida y sin "..". Sin esto, cualquier ruta del
    // bucket seria legible -- el Admin SDK no pasa por reglas.
    if (!esKeyValida(key)) {
      throw new HttpsError("invalid-argument", "La ruta del archivo no es valida.");
    }
    // ─────────────────────────────────────────────────────────────────
    // LA KEY TIENE QUE SER UN RECURSO REAL, no solo empezar bien.
    //
    // Antes bastaba con que la ruta empezara por "clientes/" o
    // "vista360/facturas/". Quien llamara podia pedir CUALQUIER archivo
    // bajo esos prefijos con solo conocer o adivinar la ruta -- incluido
    // el reporte de otro cliente.
    //
    // Mientras la funcion era solo del Gerente el riesgo era teorico (ya
    // ve todo por la via normal). Al abrirla al Trabajador deja de serlo,
    // asi que la key se ata a un recurso que existe de verdad:
    //
    //   reporte -> la ruta debe tener la forma EXACTA que genera
    //              generarReporteCliente, y el cliente debe existir.
    //   factura -> debe haber una factura cuyo pdfUrl sea esta key.
    //
    // Cuesta 1 lectura y cierra la puerta a keys inventadas. Tambien
    // endurece al Gerente, que no tenia esta comprobacion.
    // ─────────────────────────────────────────────────────────────────
    const reporte = FORMATO_REPORTE.exec(key);
    if (reporte) {
      const clienteIdDeLaRuta = reporte[1]!;
      const cliente = await db.doc(`clientes/${clienteIdDeLaRuta}`).get();
      if (!cliente.exists) {
        throw new HttpsError("permission-denied", "El archivo pedido no corresponde a un reporte.");
      }
    } else if (FORMATO_FACTURA.test(key)) {
      const factura = await db.collection("facturas").where("pdfUrl", "==", key).limit(1).get();
      if (factura.empty) {
        throw new HttpsError("permission-denied", "El archivo pedido no corresponde a una factura.");
      }
    } else {
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
