import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { PDFDocument } from "pdf-lib";
import { R2_SECRETS, descargarObjetoR2, firmarLecturaR2, subirBufferR2 } from "./r2Storage.js";

if (getApps().length === 0) {
  initializeApp();
}

interface ExportarReportesCombinadosData {
  clienteId?: string;
  mes?: string;
}

/**
 * Une en un solo PDF todos los reportes mensuales de un cliente para
 * un mes dado (uno por cada campaña que tenga) -- pensado para
 * clientes con varias campañas activas: en vez de entrar campaña por
 * campaña a descargar su PDF por separado, un solo botón "Descargar
 * resumen de [mes]" junta todo.
 *
 * Verificación de dueño: mismo patrón que firmarDescargaFactura.ts --
 * solo el cliente dueño de esos reportes (por portalUsers/{uid}.clienteId)
 * o un admin puede pedir el combinado de un clienteId.
 *
 * El PDF combinado se sube a una key fija por cliente+mes (se
 * sobreescribe si se vuelve a pedir), así no se acumulan archivos
 * viejos en R2 cada vez que alguien lo descarga de nuevo.
 */
export const exportarReportesCombinados = onCall<ExportarReportesCombinadosData>(
  { secrets: R2_SECRETS, timeoutSeconds: 180, memory: "512MiB" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const clienteId = String(request.data?.clienteId ?? "").trim();
    const mes = String(request.data?.mes ?? "").trim();
    if (!clienteId || !/^\d{4}-\d{2}$/.test(mes)) {
      throw new HttpsError("invalid-argument", "Envía clienteId y mes (YYYY-MM) válidos.");
    }

    const db = getFirestore();
    const propio = await db.doc(`portalUsers/${uid}`).get();
    const propioData = propio.data();
    const esAdmin = propioData?.role === "admin";
    if (!propio.exists || (!esAdmin && propioData?.clienteId !== clienteId)) {
      throw new HttpsError("permission-denied", "No tienes acceso a los reportes de este cliente.");
    }

    const informesSnap = await db
      .collection("informesCliente")
      .where("cliente_id", "==", clienteId)
      .where("mes", "==", mes)
      .get();

    // Solo entran los que tienen su PDF en R2 (los pocos reportes
    // viejísimos de antes de migrar a R2 no tienen r2Keys.digital --
    // se ignoran en vez de fallar todo el combinado por esos).
    const keys = informesSnap.docs
      .map((doc) => String(doc.data()?.r2Keys?.digital ?? ""))
      .filter((key): key is string => Boolean(key));

    if (keys.length < 2) {
      throw new HttpsError(
        "failed-precondition",
        "Este mes no tiene suficientes reportes de campañas distintas para combinar."
      );
    }

    const combinado = await PDFDocument.create();
    for (const key of keys) {
      const bytes = await descargarObjetoR2(key);
      const origen = await PDFDocument.load(bytes);
      const paginas = await combinado.copyPages(origen, origen.getPageIndices());
      paginas.forEach((pagina) => combinado.addPage(pagina));
    }
    const bufferCombinado = Buffer.from(await combinado.save());

    const keyCombinado = `clientes/${clienteId}/reportes/${mes}/combinado/reporte-combinado.pdf`;
    await subirBufferR2(keyCombinado, bufferCombinado, "application/pdf");
    const url = await firmarLecturaR2(keyCombinado, 6 * 60 * 60, `reporte-combinado-${mes}`);

    return { ok: true, url, numReportes: keys.length };
  }
);
