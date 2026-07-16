import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) {
  initializeApp();
}

interface ActualizarAvatarClienteData {
  clienteId?: string;
  avatarUrl?: string;
}

function limpiar(value?: string) {
  return value?.trim() ?? "";
}

function esUrlImagenCloudinary(url: string) {
  return /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(url);
}

export const actualizarAvatarCliente = onCall<ActualizarAvatarClienteData>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const propioSnap = await db.doc(`portalUsers/${uid}`).get();
  if (!propioSnap.exists) {
    throw new HttpsError("permission-denied", "Tu cuenta no está vinculada al portal.");
  }

  const propio = propioSnap.data() ?? {};
  const role = String(propio.role ?? "cliente");
  const solicitadoClienteId = limpiar(request.data.clienteId);
  const clienteId = role === "admin" ? solicitadoClienteId : limpiar(String(propio.clienteId ?? ""));
  const avatarUrl = limpiar(request.data.avatarUrl);

  if (!clienteId) {
    throw new HttpsError("invalid-argument", "Cliente requerido.");
  }
  if (!avatarUrl || !esUrlImagenCloudinary(avatarUrl)) {
    throw new HttpsError("invalid-argument", "La foto debe ser una imagen subida a Cloudinary.");
  }
  if (role !== "admin" && clienteId !== limpiar(String(propio.clienteId ?? ""))) {
    throw new HttpsError("permission-denied", "No puedes cambiar otro cliente.");
  }

  const clienteRef = db.doc(`clientes/${clienteId}`);
  const clienteSnap = await clienteRef.get();
  if (!clienteSnap.exists) {
    throw new HttpsError("not-found", "No se encontró ese cliente.");
  }

  const update = {
    avatarUrl,
    avatarKey: "custom",
    updatedAt: FieldValue.serverTimestamp(),
  };

  await clienteRef.set(update, { merge: true });

  const portalUsersSnap = await db.collection("portalUsers").where("clienteId", "==", clienteId).get();
  const batch = db.batch();
  portalUsersSnap.docs.forEach((docSnap) => {
    batch.set(docSnap.ref, { avatarUrl, avatarKey: "custom" }, { merge: true });
  });
  await batch.commit();

  return { clienteId, avatarUrl };
});
