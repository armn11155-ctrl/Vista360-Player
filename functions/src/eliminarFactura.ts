import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { esGerente } from "./rolesInternos.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { R2_SECRETS, r2Bucket, r2Client } from "./r2Storage.js";
import { regenerarResumenFacturas } from "./agregadoCliente.js";
import { exigirId } from "./identificadores.js";

if (getApps().length === 0) {
  initializeApp();
}

interface EliminarFacturaData {
  facturaId?: string;
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
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const db = getFirestore();
    const propio = await db.doc(`portalUsers/${uid}`).get();
    // esGerente() en vez de comparar el rol a mano: si algún día cambia
    // qué significa "Gerente" (otro nombre de rol, o varios), esta copia
    // suelta se habría quedado atrás sin que nadie lo notara.
    if (!propio.exists || !esGerente(propio.data()?.role)) {
      throw new HttpsError("permission-denied", "Solo la cuenta admin puede eliminar facturas.");
    }

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
      const bucket = r2Bucket();
      const client = r2Client();
      await client
        .send(new DeleteObjectCommand({ Bucket: bucket, Key: pdfUrl }))
        .catch((error) => {
          console.warn(`No se pudo borrar ${pdfUrl} de R2 (puede que ya no exista).`, error);
        });
    }

    // El cliente se lee ANTES de borrar; despues ya no existe.
    const clienteDeLaFactura = String(facturaSnap.data()?.cliente_id ?? "");
    await facturaRef.delete();
    await regenerarResumenFacturas(db, clienteDeLaFactura);
    return { ok: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("Error inesperado al eliminar la factura.", error);
    const detail = error instanceof Error ? error.message : "Error desconocido";
    throw new HttpsError("internal", `No se pudo eliminar la factura: ${detail}`);
  }
});
