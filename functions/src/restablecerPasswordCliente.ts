import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { randomInt } from "node:crypto";

if (getApps().length === 0) {
  initializeApp();
}

interface RestablecerPasswordData {
  uid?: string;
  email?: string;
}

function limpiar(value?: string) {
  return value?.trim() ?? "";
}

function generarPassword() {
  // Antes era Vista360- + texto random (mayúsculas, minúsculas,
  // guiones bajos) -- dificil de leer/escribir/dictar por WhatsApp.
  // El cliente solo la usa UNA vez para entrar (después la puede
  // cambiar desde su perfil), así que alcanza con algo simple: 6
  // dígitos nada más.
  const digitos = randomInt(100000, 1000000);
  return `Vista360-${digitos}`;
}

async function requireAdmin(uid?: string) {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  if (!propio.exists || propio.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Solo la cuenta admin puede restablecer contraseñas.");
  }
}

async function resolverUsuario(data: RestablecerPasswordData) {
  const uid = limpiar(data.uid);
  const email = limpiar(data.email).toLowerCase();
  const auth = getAuth();
  try {
    if (uid) return await auth.getUser(uid);
    if (email) return await auth.getUserByEmail(email);
  } catch {
    // cae al error de abajo si no se encuentra
  }
  return null;
}

/**
 * Genera una contraseña temporal nueva para un cliente que ya tiene
 * cuenta (a diferencia de crearClienteAcceso/crearClienteNuevo, que
 * crean el acceso la primera vez). Solo admin puede usarla -- pensada
 * para cuando un cliente perdió u olvidó su contraseña y necesita una
 * nueva para volver a entrar. Como Firebase Auth nunca guarda la
 * contraseña en texto plano, no existe forma de "recuperar" la
 * anterior -- solo se puede reemplazar por una nueva.
 */
export const restablecerPasswordCliente = onCall<RestablecerPasswordData>(async (request) => {
  await requireAdmin(request.auth?.uid);

  const usuario = await resolverUsuario(request.data);
  if (!usuario) {
    throw new HttpsError("not-found", "No se encontró ese usuario.");
  }

  const password = generarPassword();
  await getAuth().updateUser(usuario.uid, { password });

  return { email: usuario.email ?? "", password };
});
