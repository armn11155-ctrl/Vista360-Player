import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getApps, initializeApp } from "firebase-admin/app";
import * as crypto from "crypto";

if (getApps().length === 0) {
  initializeApp();
}

/**
 * Devuelve una firma válida (timestamp + signature) para subir UNA imagen
 * a Cloudinary, pero SOLO si quien llama está autenticado con Firebase Y
 * su rol en `portalUsers/{uid}` es "admin".
 *
 * Por qué existe: antes, el Player subía evidencias con un "unsigned
 * upload preset" de Cloudinary. Ese preset es público (viaja en el
 * bundle de JS del navegador), así que cualquiera que lo copiara del
 * código podía subir archivos a la cuenta de Cloudinary sin pasar por
 * la app ni por ningún control de rol — el botón de "Subir evidencia"
 * solo estaba oculto en la interfaz para clientes, no bloqueado de
 * verdad. Esta función mueve el control de acceso al servidor: sin
 * firma válida, Cloudinary rechaza la subida.
 *
 * Requiere configurar el secreto de Cloudinary (API Secret, distinto
 * del cloud name / upload preset que ya eran públicos):
 *
 *   firebase functions:secrets:set CLOUDINARY_API_SECRET
 *
 * y declararlo en el export de abajo (ver `secrets: [...]`).
 */
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY ?? "";
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME ?? "";

export const getCloudinarySignature = onCall(
  { secrets: ["CLOUDINARY_API_SECRET"] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const db = getFirestore();
    const snap = await db.doc(`portalUsers/${uid}`).get();
    if (!snap.exists || snap.data()?.role !== "admin") {
      throw new HttpsError(
        "permission-denied",
        "Solo la cuenta admin puede subir evidencias."
      );
    }

    const apiSecret = process.env.CLOUDINARY_API_SECRET ?? "";
    if (!apiSecret || !CLOUDINARY_API_KEY || !CLOUDINARY_CLOUD_NAME) {
      throw new HttpsError(
        "failed-precondition",
        "Cloudinary no está configurado en el servidor."
      );
    }

    const timestamp = Math.round(Date.now() / 1000);
    const folder = "vista360/campanas";

    // Cloudinary firma exactamente los parámetros que se van a enviar,
    // ordenados alfabéticamente, concatenados con "&", + el api secret.
    const toSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash("sha1").update(toSign).digest("hex");

    return {
      timestamp,
      signature,
      apiKey: CLOUDINARY_API_KEY,
      cloudName: CLOUDINARY_CLOUD_NAME,
      folder,
    };
  }
);
