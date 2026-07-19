import { PDFDocument } from "pdf-lib";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (getApps().length === 0) {
  initializeApp();
}

const MAX_INPUT_BYTES = 12 * 1024 * 1024;

interface ComprimirFacturaPdfData {
  nombre?: string;
  pdfBase64?: string;
}

function limpiar(value?: string) {
  return value?.trim() ?? "";
}

/**
 * Comprime el PDF de una factura con pdf-lib (JS puro).
 *
 * Antes esto pasaba por Ghostscript (binario "gs" en el sistema), que
 * NO viene instalado en el runtime de Cloud Functions (nodejs20, sin
 * Dockerfile propio) -- el try/catch lo cubría en silencio y la
 * factura se subía SIEMPRE sin comprimir de verdad. Como las facturas
 * son casi puro texto (sin fotos), lo que más pesa no son imágenes
 * sino: metadata sin usar, objetos duplicados/sueltos y una tabla de
 * referencias cruzadas sin comprimir. pdf-lib arregla eso:
 *  - useObjectStreams agrupa y comprime los objetos del PDF.
 *  - se limpia toda la metadata (título, autor, etc. del programa que
 *    generó el PDF original), que a veces pesa más de lo que parece.
 * No hay binario externo de por medio, así que esto sí funciona en
 * cualquier entorno de Cloud Functions.
 */
async function comprimirConPdfLib(input: Buffer): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(input, {
    updateMetadata: false,
    ignoreEncryption: true,
  });

  pdfDoc.setTitle("");
  pdfDoc.setAuthor("");
  pdfDoc.setSubject("");
  pdfDoc.setKeywords([]);
  pdfDoc.setProducer("Vista360 Player");
  pdfDoc.setCreator("Vista360 Player");

  const bytes = await pdfDoc.save({ useObjectStreams: true, addDefaultPage: false });
  return Buffer.from(bytes);
}

export const comprimirFacturaPdf = onCall<ComprimirFacturaPdfData>({
  memory: "512MiB",
  timeoutSeconds: 90,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const userSnap = await getFirestore().doc(`portalUsers/${uid}`).get();
  if (!userSnap.exists || String(userSnap.data()?.role ?? "cliente") !== "admin") {
    throw new HttpsError("permission-denied", "Solo el administrador puede subir facturas.");
  }

  const pdfBase64 = limpiar(request.data.pdfBase64);
  const nombre = limpiar(request.data.nombre) || "factura.pdf";
  if (!pdfBase64) {
    throw new HttpsError("invalid-argument", "PDF requerido.");
  }

  const original = Buffer.from(pdfBase64, "base64");
  if (!original.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new HttpsError("invalid-argument", "Sube un PDF válido.");
  }
  if (original.byteLength > MAX_INPUT_BYTES) {
    throw new HttpsError("invalid-argument", "El PDF es demasiado pesado. Usa un archivo menor a 12 MB.");
  }

  let finalPdf: Buffer = original;
  let compressed = false;
  try {
    const comprimido = await comprimirConPdfLib(original);
    if (comprimido.byteLength < original.byteLength) {
      finalPdf = Buffer.from(comprimido);
      compressed = true;
    }
  } catch (error) {
    // Si el PDF viene raro (protegido, corrupto, generado de forma
    // no estandar) no debe tumbar la subida -- se sube el original.
    console.warn("No se pudo comprimir la factura; se sube el PDF original.", error);
  }

  return {
    nombre: nombre.replace(/\.[^.]+$/, "") + ".pdf",
    pdfBase64: finalPdf.toString("base64"),
    originalBytes: original.byteLength,
    finalBytes: finalPdf.byteLength,
    compressed,
  };
});
