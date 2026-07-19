import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) {
  initializeApp();
}

interface ActualizarNombreFacturaData {
  facturaId?: string;
  numeroFmt?: string;
}

function limpiar(value?: string) {
  return value?.trim() ?? "";
}

/**
 * Edita solo el nombre/numero mostrado de una factura ya subida
 * (numero_fmt) -- la coleccion "facturas" pertenece a facturacion-web
 * (sistema aparte que comparte este mismo proyecto de Firebase) y sus
 * reglas no le dan permiso de ESCRITURA a las cuentas admin de
 * Vista360 Player, aunque si les dejan leer -- mismo motivo por el que
 * crearFacturaAdmin.ts ya existe. Pasa por Admin SDK para evitar el
 * mismo problema de permisos al editar en vez de crear.
 */
export const actualizarNombreFactura = onCall<ActualizarNombreFacturaData>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  if (!propio.exists || propio.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Solo la cuenta admin puede editar facturas.");
  }

  const facturaId = limpiar(request.data.facturaId);
  const numeroFmt = limpiar(request.data.numeroFmt);
  if (!facturaId) {
    throw new HttpsError("invalid-argument", "Falta la factura a editar.");
  }
  if (!numeroFmt) {
    throw new HttpsError("invalid-argument", "El nombre de la factura es obligatorio.");
  }

  const facturaRef = db.doc(`facturas/${facturaId}`);
  const facturaSnap = await facturaRef.get();
  if (!facturaSnap.exists) {
    throw new HttpsError("not-found", "No se encontró esa factura.");
  }

  await facturaRef.set(
    { numero_fmt: numeroFmt, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  return { ok: true };
});
