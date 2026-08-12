import { onCall, HttpsError } from "firebase-functions/v2/https";
import { exigirGerente } from "./cuentaPortal.js";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { R2_SECRETS, borrarObjetoR2 } from "./r2Storage.js";
import { regenerarResumenFacturas } from "./agregadoCliente.js";
import { exigirId } from "./identificadores.js";
import { auditar, auditarFallo } from "./registro.js";

if (getApps().length === 0) {
  initializeApp();
}

/**
 * Elimina una factura -- mismo motivo de permisos que
 * actualizarNombreFactura.ts: la coleccion "facturas" pertenece a
 * facturacion-web (sistema aparte que comparte este proyecto de
 * Firebase) y sus reglas no dejan escribir/borrar desde las cuentas
 * de Vista360 Player, asi que se usa Admin SDK.
 *
 * Solo borra el PDF de R2 si la factura se subio desde aca (pdfUrl es
 * una key de la carpeta "vista360/facturas/..."). Las que llegan
 * sincronizadas por RUC desde facturacion-web tienen su PDF en otro
 * lado (no en este bucket) -- ahi solo se borra el registro de
 * Firestore, no se intenta tocar un archivo que no es de este
 * sistema.
 */
export const eliminarFactura = onCall({ secrets: R2_SECRETS }, async (request) => {
  try {
    const db = getFirestore();
    const { uid } = await exigirGerente(request, "Solo la cuenta admin puede eliminar facturas.");

    const facturaId = exigirId(request.data?.facturaId, "facturaId");
    if (!facturaId) {
      throw new HttpsError("invalid-argument", "Falta la factura a eliminar.");
    }

    const facturaRef = db.doc(`facturas/${facturaId}`);
    const facturaSnap = await facturaRef.get();
    if (!facturaSnap.exists) {
      throw new HttpsError("not-found", "No se encontró esa factura.");
    }

    const pdfUrl = String(facturaSnap.data()?.pdfUrl ?? "");
    const esKeyPropia = pdfUrl && !pdfUrl.startsWith("http") && pdfUrl.startsWith("vista360/facturas/");
    if (esKeyPropia) {
      await borrarObjetoR2(pdfUrl);
    }

    // El cliente se lee ANTES de borrar; despues ya no existe.
    const clienteDeLaFactura = String(facturaSnap.data()?.cliente_id ?? "");
    await facturaRef.delete();
    await regenerarResumenFacturas(db, clienteDeLaFactura);
    // Queda el rastro de QUIEN borró qué factura y cuándo -- antes esto
    // se perdía: la factura desaparecía sin dejar registro.
    auditar("factura_eliminada", { uid, objetivoId: facturaId, clienteId: clienteDeLaFactura });
    return { ok: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    auditarFallo("factura_eliminada", error, { uid: request.auth?.uid, objetivoId: request.data?.facturaId });
    console.error("Error inesperado al eliminar la factura.", error);
    const detail = error instanceof Error ? error.message : "Error desconocido";
    throw new HttpsError("internal", `No se pudo eliminar la factura: ${detail}`);
  }
});
