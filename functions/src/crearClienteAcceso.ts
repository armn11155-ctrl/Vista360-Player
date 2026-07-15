import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";

if (getApps().length === 0) {
  initializeApp();
}

interface CrearClienteAccesoData {
  empresa?: string;
  email?: string;
  contacto?: string;
  celular?: string;
  ciudad?: string;
  ruc?: string;
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
    throw new HttpsError("permission-denied", "Solo la cuenta admin puede crear clientes.");
  }

  const empresa = limpiar(request.data.empresa);
  const email = limpiar(request.data.email).toLowerCase();
  const contacto = limpiar(request.data.contacto);
  const celular = limpiar(request.data.celular);
  const ciudad = limpiar(request.data.ciudad);
  const ruc = limpiar(request.data.ruc);

  if (!empresa || !email) {
    throw new HttpsError("invalid-argument", "Empresa y correo son obligatorios.");
  }

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
    const clienteRef = db.collection("clientes").doc();
    await clienteRef.set({
      empresa,
      email,
      contacto,
      celular,
      ciudad,
      ruc,
      estado: "Activo",
      ejecutivo: propio.data()?.nombre ?? "Vista360",
      createdAt: FieldValue.serverTimestamp(),
    });

    await db.doc(`portalUsers/${userRecord.uid}`).set({
      uid: userRecord.uid,
      role: "cliente",
      clienteId: clienteRef.id,
      email,
      nombre: contacto || empresa,
      createdAt: FieldValue.serverTimestamp(),
    });

    await db.collection("invitacionesPortal").add({
      email,
      clienteId: clienteRef.id,
      clienteNombre: empresa,
      link: "",
      createdAt: FieldValue.serverTimestamp(),
      modo: "password-temporal",
    });

    return {
      clienteId: clienteRef.id,
      empresa,
      email,
      password,
    };
  } catch (error) {
    await auth.deleteUser(userRecord.uid).catch(() => undefined);
    throw new HttpsError("internal", "No se pudo guardar el cliente.");
  }
});
