import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { exigirPersonalInterno } from "./cuentaPortal.js";
import { exigirRitmo } from "./limitador.js";
import { R2_SECRETS, nuevaKey, subirBufferR2 } from "./r2Storage.js";

if (getApps().length === 0) initializeApp();

const EXTENSION_POR_TIPO: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

// Las fotos llegan recortadas y comprimidas por el navegador. Mantener un
// tope por archivo evita usar la callable como una subida genérica y deja
// margen de sobra bajo el límite de payload de Cloud Functions.
const MAX_BYTES = 4 * 1024 * 1024;

export const subirFotoReporteServidor = onCall({
  secrets: R2_SECRETS,
  minInstances: 0,
  maxInstances: 20,
  cpu: 1,
  concurrency: 80,
}, async (request) => {
  const { uid } = await exigirPersonalInterno(
    request,
    "Solo el equipo interno puede subir fotos de reportes."
  );
  exigirRitmo(uid, "subirFotoReporteServidor", 60);

  const contentType = String(request.data?.contentType ?? "");
  const extension = EXTENSION_POR_TIPO[contentType];
  if (!extension) throw new HttpsError("invalid-argument", "Tipo de imagen no permitido.");

  const dataBase64 = String(request.data?.dataBase64 ?? "");
  if (!dataBase64) throw new HttpsError("invalid-argument", "Falta la foto.");

  const buffer = Buffer.from(dataBase64, "base64");
  if (buffer.length === 0) throw new HttpsError("invalid-argument", "La foto llegó vacía.");
  if (buffer.length > MAX_BYTES) {
    throw new HttpsError("invalid-argument", "La foto es demasiado pesada incluso después de comprimirla.");
  }

  const key = nuevaKey("vista360/campanas", extension);
  await subirBufferR2(key, buffer, contentType);
  return { key };
});
