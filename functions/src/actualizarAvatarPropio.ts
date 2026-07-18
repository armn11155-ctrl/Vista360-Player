import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { esKeyValida } from "./r2Storage.js";

if (getApps().length === 0) {
  initializeApp();
}

interface ActualizarAvatarPropioData {
  avatarUrl?: string;
}

/**
 * Cambia el avatar de la CUENTA que hace la llamada (portalUsers/{uid}
 * propio) — a diferencia de actualizarAvatarCliente, que es para que
 * el admin cambie la foto de OTRO cliente. Esta es para "Mi perfil"
 * del admin (o de cualquier usuario del portal, si algún día hace
 * falta): cada quien solo puede tocar su propio documento.
 */
export const actualizarAvatarPropio = onCall<ActualizarAvatarPropioData>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const avatarUrl = String(request.data?.avatarUrl ?? "").trim();
  if (!avatarUrl || !esKeyValida(avatarUrl)) {
    throw new HttpsError("invalid-argument", "La foto debe ser una imagen subida a R2.");
  }

  const db = getFirestore();
  const propioRef = db.doc(`portalUsers/${uid}`);
  const propioSnap = await propioRef.get();
  if (!propioSnap.exists) {
    throw new HttpsError("permission-denied", "Tu cuenta no está vinculada al portal.");
  }

  await propioRef.set({ avatarUrl }, { merge: true });

  return { avatarUrl };
});
