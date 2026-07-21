import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) initializeApp();

interface ActualizarContratoData {
  contratoId?: string;
  nombre?: string;
  inicio?: string;
  fin?: string;
}

function limpiar(value?: string) {
  return value?.trim() ?? "";
}

function nombreConMayuscula(value: string) {
  return value.charAt(0).toLocaleUpperCase("es-PE") + value.slice(1);
}

export const actualizarContrato = onCall<ActualizarContratoData>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

  const db = getFirestore();
  const usuario = await db.doc(`portalUsers/${uid}`).get();
  if (!usuario.exists || usuario.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Solo la cuenta administradora puede editar campañas.");
  }

  const contratoId = limpiar(request.data.contratoId);
  const nombre = nombreConMayuscula(limpiar(request.data.nombre));
  const inicio = limpiar(request.data.inicio);
  const fin = limpiar(request.data.fin);

  if (!contratoId) throw new HttpsError("invalid-argument", "Falta la campaña.");
  if (!nombre) throw new HttpsError("invalid-argument", "Escribe el nombre de la campaña.");
  if (!inicio || !fin) throw new HttpsError("invalid-argument", "Completa las dos fechas.");
  if (fin < inicio) throw new HttpsError("invalid-argument", "La fecha de fin no puede ser anterior al inicio.");

  const ref = db.doc(`contratos/${contratoId}`);
  const actual = await ref.get();
  if (!actual.exists) throw new HttpsError("not-found", "No se encontró esa campaña.");

  await ref.update({ nombre, inicio, fin });
  return { ok: true };
});
