import { onCall, HttpsError } from "firebase-functions/v2/https";
import { exigirGerente } from "./cuentaPortal.js";
import { getAuth } from "firebase-admin/auth";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { randomInt } from "node:crypto";

if (getApps().length === 0) {
  initializeApp();
}

interface CrearTrabajadorAccesoData {
  nombre?: string;
  email?: string;
  password?: string;
}

function limpiar(value?: string) {
  return value?.trim() ?? "";
}

function generarPassword() {
  // Mismo criterio que crearClienteAcceso.ts: fácil de leer/dictar,
  // el trabajador la puede cambiar apenas entra.
  const digitos = randomInt(100000, 1000000);
  return `Vista360${digitos}`;
}

function validarPassword(password: string) {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

/**
 * Crea una cuenta de acceso para un Trabajador (empleado interno, no
 * un cliente) -- antes solo existía una forma de crear cuentas de
 * cliente (crearClienteAcceso.ts); las cuentas de equipo interno
 * ("admin"/Gerente) se creaban a mano, fuera de la app. Con el rol
 * Trabajador nuevo, hace falta una forma real de invitarlos desde acá.
 * Mismo patrón que crearClienteAcceso.ts: cuenta de Firebase Auth +
 * documento en portalUsers, pero SIN clienteId (el trabajador, como el
 * Gerente, elige a cuál cliente ver desde el selector dentro de la
 * app, no está atado a uno solo).
 */
export const crearTrabajadorAcceso = onCall<CrearTrabajadorAccesoData>(async (request) => {
  const db = getFirestore();
  await exigirGerente(request, "Solo el Gerente puede crear cuentas de trabajador.");

  const nombre = limpiar(request.data.nombre);
  const email = limpiar(request.data.email).toLowerCase();
  const passwordSolicitada = limpiar(request.data.password);

  if (!nombre || !email) {
    throw new HttpsError("invalid-argument", "Nombre y correo son obligatorios.");
  }
  if (passwordSolicitada && !validarPassword(passwordSolicitada)) {
    throw new HttpsError("invalid-argument", "La contraseña debe tener mínimo 8 caracteres, letras y números.");
  }

  const auth = getAuth();
  const password = passwordSolicitada || generarPassword();
  let userRecord;

  try {
    userRecord = await auth.createUser({
      email,
      password,
      displayName: nombre,
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
      role: "trabajador",
      email,
      nombre,
      createdAt: FieldValue.serverTimestamp(),
    });

    await db.collection("invitacionesPortal").add({
      uid: userRecord.uid,
      email,
      // Antes no se guardaba nombre acá (solo en portalUsers) -- la
      // lista de Usuarios lee de esta colección, así que un Trabajador
      // recién creado aparecía con el correo en vez de su nombre.
      clienteNombre: nombre,
      esTrabajador: true,
      link: "",
      createdAt: FieldValue.serverTimestamp(),
      modo: "password-temporal",
    });

    return { uid: userRecord.uid, nombre, email, password };
  } catch (error) {
    await auth.deleteUser(userRecord.uid).catch(() => undefined);
    throw new HttpsError("internal", "No se pudo guardar la cuenta de trabajador.");
  }
});
