import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { esGerente, esPersonalInterno } from "./rolesInternos.js";

if (getApps().length === 0) {
  initializeApp();
}

interface PersonaInterna {
  uid: string;
  email: string;
  nombre: string;
  avatarUrl?: string;
  role: "Gerente" | "Trabajador";
  archived: boolean;
}

/**
 * Lista TODAS las cuentas internas (role "admin" o "trabajador") leyendo
 * directo de portalUsers -- la fuente real de permisos. Se agregó
 * porque las etiquetas GERENTE/TRABAJADOR que ya mostraba Usuarios
 * (Accesos.tsx) dependían de un campo (esAdmin) que se setea a mano en
 * invitacionesPortal y nunca se sincroniza con el role real: una cuenta
 * podía tener role:"admin" en portalUsers y aun así no aparecer
 * marcada. Esta función es Gerente-only y es la forma confiable de
 * verificar quién tiene qué permiso en este momento.
 */
export const listarPersonalInterno = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const propioRef = db.doc(`portalUsers/${uid}`);
  const propio = await propioRef.get();
  if (!propio.exists || !esGerente(propio.data()?.role)) {
    throw new HttpsError("permission-denied", "Solo el Gerente puede ver esta lista.");
  }

  // Cuentas de Gerente creadas a mano antes de que existiera este
  // sistema de roles nunca tuvieron "email" en portalUsers (solo
  // las creadas después, vía crearTrabajadorAcceso, sí lo traen) --
  // por eso esa fila aparecía sin nombre y sin correo acá (el
  // fallback de nombre por correo, del lado del cliente, tampoco
  // tenía de qué correo partir). El correo verificado de quien
  // llama SÍ está siempre disponible en el token de autenticación,
  // así que se autocompleta la propia fila con eso y se guarda de
  // una vez en Firestore para no depender de este parche after.
  const correoPropioToken = String(request.auth?.token.email ?? "").trim();
  if (correoPropioToken && !String(propio.data()?.email ?? "").trim()) {
    await propioRef.set({ email: correoPropioToken }, { merge: true });
  }

  const snap = await db.collection("portalUsers").get();
  const personal: PersonaInterna[] = snap.docs
    .map((d) => d.data())
    .filter((d) => esPersonalInterno(d.role))
    .map((d) => ({
      uid: String(d.uid ?? ""),
      email: String(d.email ?? "") || (String(d.uid ?? "") === uid ? correoPropioToken : ""),
      nombre: String(d.nombre ?? ""),
      // No se traía -- por eso nadie mostraba su foto acá aunque ya
      // la hubieran subido en "Mi perfil" (actualizarAvatarPropio).
      ...(d.avatarUrl ? { avatarUrl: String(d.avatarUrl) } : {}),
      role: (d.role === "admin" ? "Gerente" : "Trabajador") as PersonaInterna["role"],
      archived: !!d.archived,
    }))
    .sort((a, b) => (a.role === b.role ? a.email.localeCompare(b.email) : a.role === "Gerente" ? -1 : 1));

  return { personal };
});
