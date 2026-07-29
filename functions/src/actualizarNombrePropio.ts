import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { esPersonalInterno } from "./rolesInternos.js";

if (getApps().length === 0) {
  initializeApp();
}

interface ActualizarNombrePropioData {
  nombre?: string;
}

/**
 * Cambia el nombre de la CUENTA que hace la llamada (portalUsers/{uid}
 * propio), igual que actualizarAvatarPropio pero para el nombre. Hacía
 * falta porque las cuentas de Gerente creadas a mano (antes de que
 * existiera este sistema de roles) nunca tuvieron un campo "nombre"
 * en portalUsers, así que "Mi perfil", el sidebar, y Personal interno
 * caían todos al nombre del ROL ("Gerente") en vez de mostrar el
 * nombre real -- no había ninguna pantalla donde pudieras escribirlo.
 * Restringido a personal interno (Gerente/Trabajador): los clientes
 * no editan su propio nombre desde acá, eso lo hace el Gerente por
 * ellos vía actualizarClienteInfo.
 */
export const actualizarNombrePropio = onCall<ActualizarNombrePropioData>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const nombre = String(request.data?.nombre ?? "").trim();
  if (!nombre) {
    throw new HttpsError("invalid-argument", "Escribe tu nombre.");
  }
  if (nombre.length > 80) {
    throw new HttpsError("invalid-argument", "El nombre es demasiado largo.");
  }

  const db = getFirestore();
  const propioRef = db.doc(`portalUsers/${uid}`);
  const propioSnap = await propioRef.get();
  if (!propioSnap.exists || !esPersonalInterno(propioSnap.data()?.role)) {
    throw new HttpsError("permission-denied", "Solo el equipo interno puede editar su nombre acá.");
  }

  await propioRef.set({ nombre }, { merge: true });

  return { nombre };
});
