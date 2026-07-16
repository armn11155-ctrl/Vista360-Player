import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) {
  initializeApp();
}

interface ActualizarImagenCampaniaData {
  contratoId?: string;
  imagenUrl?: string;
}

function limpiar(value?: string) {
  return value?.trim() ?? "";
}

function esUrlImagenCloudinary(url: string) {
  return /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(url);
}

export const actualizarImagenCampania = onCall<ActualizarImagenCampaniaData>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const portalUserSnap = await db.doc(`portalUsers/${uid}`).get();
  if (!portalUserSnap.exists || portalUserSnap.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Solo la cuenta admin puede cambiar la foto de campaña.");
  }

  const contratoId = limpiar(request.data.contratoId);
  const imagenUrl = limpiar(request.data.imagenUrl);
  if (!contratoId) {
    throw new HttpsError("invalid-argument", "Campaña requerida.");
  }
  if (!imagenUrl || !esUrlImagenCloudinary(imagenUrl)) {
    throw new HttpsError("invalid-argument", "La foto debe ser una imagen subida a Cloudinary.");
  }

  const contratoRef = db.doc(`contratos/${contratoId}`);
  const contratoSnap = await contratoRef.get();
  if (!contratoSnap.exists || contratoSnap.data()?.deleted) {
    throw new HttpsError("not-found", "No se encontró esa campaña.");
  }

  const fecha = new Date().toISOString().slice(0, 10);
  await contratoRef.set(
    {
      imagenCampaniaUrl: imagenUrl,
      imagenCampaniaFecha: fecha,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { contratoId, imagenUrl, fecha };
});
