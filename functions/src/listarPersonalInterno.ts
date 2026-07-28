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
  const propio = await db.doc(`portalUsers/${uid}`).get();
  if (!propio.exists || !esGerente(propio.data()?.role)) {
    throw new HttpsError("permission-denied", "Solo el Gerente puede ver esta lista.");
  }

  const snap = await db.collection("portalUsers").get();
  const personal: PersonaInterna[] = snap.docs
    .map((d) => d.data())
    .filter((d) => esPersonalInterno(d.role))
    .map((d) => ({
      uid: String(d.uid ?? ""),
      email: String(d.email ?? ""),
      nombre: String(d.nombre ?? ""),
      role: (d.role === "admin" ? "Gerente" : "Trabajador") as PersonaInterna["role"],
      archived: !!d.archived,
    }))
    .sort((a, b) => (a.role === b.role ? a.email.localeCompare(b.email) : a.role === "Gerente" ? -1 : 1));

  return { personal };
});
