import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { R2_SECRETS, borrarObjetoR2, esKeyValida } from "./r2Storage.js";

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

export const actualizarAvatarCliente = onCall<ActualizarAvatarClienteData>({ secrets: R2_SECRETS }, async (request) => {
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
  if (!avatarUrl || !esKeyValida(avatarUrl)) {
    throw new HttpsError("invalid-argument", "La foto debe ser una imagen subida a R2.");
  }
  if (role !== "admin" && clienteId !== limpiar(String(propio.clienteId ?? ""))) {
    throw new HttpsError("permission-denied", "No puedes cambiar otro cliente.");
  }

  const clienteRef = db.doc(`clientes/${clienteId}`);
  const clienteSnap = await clienteRef.get();
  if (!clienteSnap.exists) {
    throw new HttpsError("not-found", "No se encontró ese cliente.");
  }
  const avatarAnterior = limpiar(String(clienteSnap.data()?.avatarUrl ?? ""));

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

  // Ya quedó guardado el avatar nuevo — borramos el anterior para no
  // dejarlo ocupando espacio en R2 para siempre (si era una URL vieja
  // de Cloudinary, esKeyValida la descarta y no se intenta borrar nada).
  if (avatarAnterior && avatarAnterior !== avatarUrl && esKeyValida(avatarAnterior)) {
    await borrarObjetoR2(avatarAnterior);
  }

  return { clienteId, avatarUrl };
});
