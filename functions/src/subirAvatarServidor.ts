import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { R2_SECRETS, nuevaKey, subirBufferR2 } from "./r2Storage.js";

if (getApps().length === 0) {
  initializeApp();
}

interface SubirAvatarServidorData {
  dataBase64?: string;
  contentType?: string;
}

const TIPOS_PERMITIDOS: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

const MAX_BYTES = 3 * 1024 * 1024; // de sobra para un avatar ya comprimido (~320x320)

/**
 * Sube el avatar de un cliente DESDE el servidor, en vez del flujo
 * normal (navegador pide una URL firmada y sube directo a R2). Ese
 * flujo directo depende de que el bucket de R2 tenga CORS configurado
 * para el dominio exacto de la app, y eso vive fuera de este repo (se
 * configura a mano en el dashboard de Cloudflare) — para algo tan chico
 * como un avatar (ya comprimido a ~320x320 en el navegador) es más
 * simple mandarlo en base64 a esta función y que ella lo suba, así no
 * depende de esa configuración externa.
 *
 * Las fotos/videos de evidencia de campañas siguen usando el flujo
 * directo a R2 (pueden pesar varios MB, no conviene pasarlos por acá).
 */
export const subirAvatarServidor = onCall({ secrets: R2_SECRETS }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const snap = await db.doc(`portalUsers/${uid}`).get();
  if (!snap.exists) {
    throw new HttpsError("permission-denied", "Tu cuenta no está vinculada al portal.");
  }

  const contentType = String((request.data as SubirAvatarServidorData)?.contentType ?? "");
  const extension = TIPOS_PERMITIDOS[contentType];
  if (!extension) {
    throw new HttpsError("invalid-argument", "Tipo de archivo no permitido.");
  }

  const dataBase64 = String((request.data as SubirAvatarServidorData)?.dataBase64 ?? "");
  if (!dataBase64) {
    throw new HttpsError("invalid-argument", "Falta el archivo.");
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(dataBase64, "base64");
  } catch {
    throw new HttpsError("invalid-argument", "El archivo llegó dañado.");
  }
  if (buffer.length === 0) {
    throw new HttpsError("invalid-argument", "El archivo llegó vacío.");
  }
  if (buffer.length > MAX_BYTES) {
    throw new HttpsError("invalid-argument", "La imagen es muy pesada.");
  }

  const key = nuevaKey("vista360/avatares", extension);
  await subirBufferR2(key, buffer, contentType);

  return { key };
});
