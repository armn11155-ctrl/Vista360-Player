import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (getApps().length === 0) {
  initializeApp();
}

const execFileAsync = promisify(execFile);
const MAX_INPUT_BYTES = 12 * 1024 * 1024;

interface ComprimirFacturaPdfData {
  nombre?: string;
  pdfBase64?: string;
}

function limpiar(value?: string) {
  return value?.trim() ?? "";
}

async function comprimirConGhostscript(input: Buffer, dpi: 96 | 120) {
  const dir = await mkdtemp(join(tmpdir(), "vista360-factura-"));
  const source = join(dir, "source.pdf");
  const output = join(dir, `compressed-${dpi}.pdf`);
  await writeFile(source, input);
  try {
    await execFileAsync(process.env.GS_BINARY ?? "gs", [
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      "-dPDFSETTINGS=/ebook",
      "-dNOPAUSE",
      "-dQUIET",
      "-dBATCH",
      "-dDetectDuplicateImages=true",
      "-dCompressFonts=true",
      "-dSubsetFonts=true",
      "-dDownsampleColorImages=true",
      "-dDownsampleGrayImages=true",
      "-dDownsampleMonoImages=true",
      `-dColorImageResolution=${dpi}`,
      `-dGrayImageResolution=${dpi}`,
      `-dMonoImageResolution=${dpi}`,
      "-sOutputFile=" + output,
      source,
    ]);
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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

  // Ghostscript no esta garantizado en el runtime de Cloud Functions
  // (buildpack de Google, sin gs instalado por defecto). Si no esta
  // disponible, no debe tumbar la subida de la factura — se sube el
  // PDF original sin comprimir en vez de fallar por completo.
  let finalPdf = original;
  let compressed = false;
  try {
    const comprimido120 = await comprimirConGhostscript(original, 120);
    const comprimido96 = comprimido120.byteLength > 4 * 1024 * 1024
      ? await comprimirConGhostscript(original, 96)
      : comprimido120;
    if (comprimido96.byteLength < original.byteLength) {
      finalPdf = comprimido96;
      compressed = true;
    }
  } catch (error) {
    console.warn("No se pudo comprimir la factura (Ghostscript no disponible); se sube el PDF original.", error);
  }

  return {
    nombre: nombre.replace(/\.[^.]+$/, "") + ".pdf",
    pdfBase64: finalPdf.toString("base64"),
    originalBytes: original.byteLength,
    finalBytes: finalPdf.byteLength,
    compressed,
  };
});
