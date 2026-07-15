import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";

if (getApps().length === 0) {
  initializeApp();
}

interface CrearClienteAccesoData {
  clienteId?: string;
  email?: string;
  contacto?: string;
  celular?: string;
}

function limpiar(value?: string) {
  return value?.trim() ?? "";
}

function generarPassword() {
  const token = randomBytes(5).toString("base64url");
  return `Vista360-${token}`;
}

export const crearClienteAcceso = onCall<CrearClienteAccesoData>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  if (!propio.exists || propio.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Solo la cuenta admin puede crear usuarios.");
  }

  const clienteId = limpiar(request.data.clienteId);
  const email = limpiar(request.data.email).toLowerCase();
  const contacto = limpiar(request.data.contacto);
  const celular = limpiar(request.data.celular);

  if (!clienteId || !email) {
    throw new HttpsError("invalid-argument", "Cliente y correo son obligatorios.");
  }

  const clienteSnap = await db.doc(`clientes/${clienteId}`).get();
  if (!clienteSnap.exists) {
    throw new HttpsError("not-found", "No se encontró ese cliente.");
  }
  const cliente = clienteSnap.data() ?? {};
  const empresa = String(cliente.empresa ?? clienteId);

  const auth = getAuth();
  const password = generarPassword();
  let userRecord;

  try {
    userRecord = await auth.createUser({
      email,
      password,
      displayName: contacto || empresa,
      emailVerified: false,
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code.includes("email-already-exists")) {
      throw new HttpsError("already-exists", "Ese correo ya tiene una cuenta creada.");
    }
    throw new HttpsError("internal", "No se pudo crear la cuenta de acceso.");
  }

  try {
    await db.doc(`portalUsers/${userRecord.uid}`).set({
      uid: userRecord.uid,
      role: "cliente",
      clienteId,
      email,
      nombre: contacto || empresa,
      createdAt: FieldValue.serverTimestamp(),
    });

    await clienteSnap.ref.set({
      email: email || cliente.email || "",
      contacto: contacto || cliente.contacto || "",
      celular: celular || cliente.celular || "",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await db.collection("invitacionesPortal").add({
      email,
      clienteId,
      clienteNombre: empresa,
      link: "",
      createdAt: FieldValue.serverTimestamp(),
      modo: "password-temporal",
    });

    return {
      clienteId,
      empresa,
      email,
      password,
    };
  } catch (error) {
    await auth.deleteUser(userRecord.uid).catch(() => undefined);
    throw new HttpsError("internal", "No se pudo guardar el usuario del cliente.");
  }
});
