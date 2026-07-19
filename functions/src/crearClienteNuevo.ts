import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";

if (getApps().length === 0) {
  initializeApp();
}

interface CrearClienteNuevoData {
  empresa?: string;
  ruc?: string;
  sector?: string;
  ciudad?: string;
  email?: string;
  contacto?: string;
  celular?: string;
  avatarKey?: string;
  avatarUrl?: string;
  password?: string;
}

const AVATAR_KEYS = new Set(["tower", "store", "factory", "mall", "office", "media"]);

function limpiar(value?: string) {
  return value?.trim() ?? "";
}

function generarPassword() {
  const token = randomBytes(5).toString("base64url");
  return `Vista360-${token}`;
}

function validarPassword(password: string) {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

/**
 * Crea un cliente (empresa) nuevo desde cero -- antes solo existia
 * crearClienteAcceso, que requiere que el cliente YA exista en
 * Firestore (lo administra el dueño en Vista360, el sistema aparte).
 * Esta funcion junta los dos pasos en uno: crea clientes/{id} y de una
 * vez el acceso (auth user + portalUsers + invitacionesPortal), para
 * poder dar de alta un cliente sin salir de Vista360 Player.
 */
export const crearClienteNuevo = onCall<CrearClienteNuevoData>(async (request) => {
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
  const ruc = limpiar(request.data.ruc);
  const sector = limpiar(request.data.sector);
  const ciudad = limpiar(request.data.ciudad);
  const email = limpiar(request.data.email).toLowerCase();
  const contacto = limpiar(request.data.contacto);
  const celular = limpiar(request.data.celular);
  const avatarKeyRaw = limpiar(request.data.avatarKey);
  const avatarKey = AVATAR_KEYS.has(avatarKeyRaw) ? avatarKeyRaw : "tower";
  const avatarUrl = limpiar(request.data.avatarUrl);
  const passwordSolicitada = limpiar(request.data.password);

  if (!empresa) {
    throw new HttpsError("invalid-argument", "El nombre de la empresa es obligatorio.");
  }
  if (!email) {
    throw new HttpsError("invalid-argument", "El correo del usuario es obligatorio.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "El correo no es válido. Revisa que esté bien escrito (ejemplo: nombre@correo.com).");
  }
  if (passwordSolicitada && !validarPassword(passwordSolicitada)) {
    throw new HttpsError("invalid-argument", "La contraseña debe tener mínimo 8 caracteres, letras y números.");
  }

  if (ruc) {
    const existente = await db.collection("clientes").where("ruc", "==", ruc).limit(1).get();
    if (!existente.empty) {
      throw new HttpsError("already-exists", "Ya existe un cliente con ese RUC.");
    }
  }

  const auth = getAuth();
  const password = passwordSolicitada || generarPassword();
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
    console.error("crearClienteNuevo: fallo auth.createUser", { code, error });
    if (code.includes("email-already-exists")) {
      throw new HttpsError("already-exists", "Ese correo ya tiene una cuenta creada.");
    }
    if (code.includes("invalid-email")) {
      throw new HttpsError("invalid-argument", "El correo no es válido.");
    }
    if (code.includes("invalid-password") || code.includes("weak-password")) {
      throw new HttpsError("invalid-argument", "La contraseña no es válida (mínimo 6 caracteres).");
    }
    const detalle = error instanceof Error ? error.message : String(error);
    throw new HttpsError("internal", `No se pudo crear la cuenta de acceso: ${detalle}`);
  }

  const clienteRef = db.collection("clientes").doc();
  const clienteId = clienteRef.id;

  try {
    await clienteRef.set({
      empresa,
      ...(ruc ? { ruc } : {}),
      ...(sector ? { sector } : {}),
      ...(ciudad ? { ciudad } : {}),
      estado: "Activo",
      email,
      contacto,
      celular,
      avatarKey,
      ...(avatarUrl ? { avatarUrl } : {}),
      createdAt: FieldValue.serverTimestamp(),
    });

    await db.doc(`portalUsers/${userRecord.uid}`).set({
      uid: userRecord.uid,
      role: "cliente",
      clienteId,
      email,
      nombre: contacto || empresa,
      avatarKey: avatarKey || null,
      avatarUrl: avatarUrl || null,
      createdAt: FieldValue.serverTimestamp(),
    });

    await db.collection("invitacionesPortal").add({
      uid: userRecord.uid,
      email,
      clienteId,
      clienteNombre: empresa,
      avatarKey: avatarKey || null,
      avatarUrl: avatarUrl || null,
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
    console.error("crearClienteNuevo: fallo al guardar cliente/acceso", error);
    await auth.deleteUser(userRecord.uid).catch(() => undefined);
    await clienteRef.delete().catch(() => undefined);
    const detalle = error instanceof Error ? error.message : String(error);
    throw new HttpsError("internal", `No se pudo guardar el cliente nuevo: ${detalle}`);
  }
});
