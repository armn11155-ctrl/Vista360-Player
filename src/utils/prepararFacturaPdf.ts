import { httpsCallable } from "firebase/functions";
import { cloudFunctions } from "../config/firebase";

const MAX_FACTURA_PDF_BYTES = 12 * 1024 * 1024;

interface ComprimirFacturaPdfResponse {
  nombre: string;
  pdfBase64: string;
  originalBytes: number;
  finalBytes: number;
  compressed: boolean;
}

export interface FacturaPdfPreparada {
  file: File;
  originalBytes: number;
  finalBytes: number;
  compressed: boolean;
}

export function formatoBytes(bytes: number): string {
  // Base decimal (1000), no binaria (1024): asi coincide con lo que
  // muestran Finder, Android/iOS y la mayoria de administradores de
  // archivos al ver el PDF ya descargado -- antes, al calcular en
  // base 1024 pero mostrar la etiqueta "KB"/"MB" (que en realidad es
  // decimal), el numero de aca salia mas chico que el tamano real que
  // veia el usuario en su telefono o compu, aunque el archivo fuera
  // exactamente el mismo.
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.includes(",") ? value.split(",")[1] : value);
    };
    reader.onerror = () => reject(new Error("No se pudo leer el PDF."));
    reader.readAsDataURL(file);
  });
}

function base64ToFile(base64: string, name: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], name, { type: "application/pdf" });
}

export async function prepararFacturaPdf(file: File): Promise<FacturaPdfPreparada> {
  if (file.type !== "application/pdf") {
    throw new Error("Sube un PDF válido.");
  }

  if (file.size > MAX_FACTURA_PDF_BYTES) {
    throw new Error(
      `Ese PDF pesa ${formatoBytes(file.size)}. Para facturas usa un PDF menor a ${formatoBytes(MAX_FACTURA_PDF_BYTES)}.`
    );
  }

  const nombre = file.name.replace(/\.[^.]+$/, "") || "factura";
  const normalizado = new File([file], `${nombre}.pdf`, { type: "application/pdf" });

  if (!cloudFunctions) {
    return {
      file: normalizado,
      originalBytes: file.size,
      finalBytes: normalizado.size,
      compressed: false,
    };
  }

  const fn = httpsCallable<{ nombre: string; pdfBase64: string }, ComprimirFacturaPdfResponse>(
    cloudFunctions,
    "comprimirFacturaPdf"
  );
  const result = await fn({
    nombre: normalizado.name,
    pdfBase64: await fileToBase64(normalizado),
  });
  const optimizado = base64ToFile(result.data.pdfBase64, result.data.nombre);
  return {
    file: optimizado,
    originalBytes: result.data.originalBytes,
    finalBytes: result.data.finalBytes,
    compressed: result.data.compressed,
  };
}
