import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { R2_SECRETS, borrarObjetoR2 } from "./r2Storage.js";

if (getApps().length === 0) {
  initializeApp();
}

interface EliminarContratoData {
  contratoId?: string;
}

/**
 * Elimina una campaña (contrato) -- lo pidió el admin para poder
 * borrar campañas directo desde la lista, con el mismo patrón de
 * permisos que el resto de acciones sensibles (Admin SDK, no depende
 * de reglas de Firestore). De paso libera el panel (vuelve a
 * "Disponible" si estaba "Ocupado" por esta campaña) y borra la foto
 * de portada de R2 si tenía una, para no dejar espacio ocupado sin uso.
 */
export const eliminarContrato = onCall<EliminarContratoData>({ secrets: R2_SECRETS }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  if (!propio.exists || propio.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Solo la cuenta admin puede eliminar campañas.");
  }

  const contratoId = String(request.data?.contratoId ?? "").trim();
  if (!contratoId) {
    throw new HttpsError("invalid-argument", "Falta contratoId.");
  }

  const contratoRef = db.doc(`contratos/${contratoId}`);
  const contratoSnap = await contratoRef.get();
  if (!contratoSnap.exists) {
    throw new HttpsError("not-found", "No se encontró esa campaña.");
  }
  const contrato = contratoSnap.data() ?? {};

  if (contrato.panel_id) {
    await db.doc(`paneles/${contrato.panel_id}`).set({ estado: "Disponible" }, { merge: true }).catch(() => undefined);
  }
  if (typeof contrato.imagenCampaniaUrl === "string" && contrato.imagenCampaniaUrl) {
    await borrarObjetoR2(contrato.imagenCampaniaUrl);
  }

  await contratoRef.delete();

  return { ok: true };
});
