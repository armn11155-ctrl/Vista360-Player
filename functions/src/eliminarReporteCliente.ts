import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { R2_SECRETS, borrarObjetoR2 } from "./r2Storage.js";
import { exigirId } from "./identificadores.js";
import { eliminarMetadataInforme } from "./agregadoInformes.js";

if (getApps().length === 0) {
  initializeApp();
}

/**
 * Borra el PDF (digital + hd) de un reporte en R2 para liberar espacio,
 * y limpia el registro viejo en Firestore si quedo alguno (la lista ya
 * no depende de Firestore, pero no vale la pena dejar basura ahi).
 * Solo admin puede borrar.
 */
export const eliminarReporteCliente = onCall({ secrets: R2_SECRETS }, async (request) => {
  try {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesion.");
    }

    const db = getFirestore();
    const propio = await db.doc(`portalUsers/${uid}`).get();
    if (!propio.exists || propio.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "Solo la cuenta admin puede eliminar reportes.");
    }

    // VALIDADO: este id se pega directo a la key de R2 mas abajo
    // (`clientes/${clienteId}/reportes/...`). Sin validar, un
    // "../../vista360/facturas" saldria de la carpeta de reportes, y del
    // lado de R2 no hay reglas de seguridad que frenen nada.
    const clienteId = exigirId(request.data?.clienteId, "clienteId");
    const mes = String(request.data?.mes ?? "");
    const diaRaw = String(request.data?.dia ?? "").padStart(2, "0");
    const dia = /^\d{2}$/.test(diaRaw) ? diaRaw : "";
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      throw new HttpsError("invalid-argument", "Envia el mes en formato YYYY-MM.");
    }

    // Desde que existe un reporte por dia (no solo por mes), la key en
    // R2 y el id del documento en Firestore incluyen el dia --
    // borrar solo con clienteId+mes (como antes) apuntaba a una key y
    // un documento que ya no existian, asi que no fallaba pero
    // tampoco borraba nada de verdad. Si no llega "dia" (reportes
    // viejos, de antes de esa funcionalidad), se usa el esquema
    // antiguo como respaldo.
    if (dia) {
      const prefix = `clientes/${clienteId}/reportes/${mes}/${dia}`;
      await borrarObjetoR2(`${prefix}/reporte-digital.pdf`);
      await db
        .collection("informesCliente")
        .doc(`${clienteId}_${mes}-${dia}`)
        .delete()
        .catch(() => undefined);
      await eliminarMetadataInforme(db, clienteId, `${mes}-${dia}`);
    } else {
      const prefix = `clientes/${clienteId}/reportes/${mes}`;
      const keys = [`${prefix}/reporte-digital.pdf`, `${prefix}/reporte-hd.pdf`];
      await Promise.all(keys.map((key) => borrarObjetoR2(key)));
      await db
        .collection("informesCliente")
        .doc(`${clienteId}_${mes}`)
        .delete()
        .catch(() => undefined);
      await eliminarMetadataInforme(db, clienteId, mes);
    }

    return { ok: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("Error inesperado al eliminar el reporte.", error);
    const detail = error instanceof Error ? error.message : "Error desconocido";
    throw new HttpsError("internal", `No se pudo eliminar el reporte: ${detail}`);
  }
});
