import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { R2_SECRETS, esKeyValida, firmarLecturaR2 } from "./r2Storage.js";
import { esPersonalInterno } from "./rolesInternos.js";

if (getApps().length === 0) {
  initializeApp();
}

const EXPIRACION_SEGUNDOS = 6 * 60 * 60;

/**
 * Firma UNA sola key de R2 con Content-Disposition: attachment, para
 * el botón "Descargar" de la tarjeta de factura -- mismo patrón que
 * ya usa listarReportesCliente.ts para los reportes (url para ver +
 * urlDescarga para forzar la descarga), pero como aquí cada factura
 * se pide bajo demanda (no en un listado por mes), es una función
 * chica aparte en vez de agregarla al firmado en lote de fotos.
 *
 * Verificación de dueño: antes esta función firmaba CUALQUIER key que
 * llegara con forma válida (carpeta correcta, sin ".."), sin revisar
 * si la factura de esa key en verdad pertenece al cliente que llama.
 * Desde el portal esto nunca se nota (la tarjeta solo conoce las keys
 * de sus propias facturas, ya filtradas por las reglas de Firestore),
 * pero esta función se puede llamar directo (con cualquier token
 * válido, sin pasar por la UI) -- si alguien adivinara o consiguiera
 * la key de la factura de OTRO cliente, esta función se la firmaba
 * igual. Ahora se busca en Firestore el documento de "facturas" cuyo
 * pdfUrl sea exactamente esa key y se exige que su cliente (por
 * cliente_id directo o por RUC) sea el mismo que el que llama --
 * salvo que sea admin, que puede descargar cualquiera.
 */
export const firmarDescargaFactura = onCall({ secrets: R2_SECRETS }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const snap = await db.doc(`portalUsers/${uid}`).get();
  if (!snap.exists) {
    throw new HttpsError("permission-denied", "Tu cuenta no está vinculada al portal.");
  }
  const propio = snap.data() ?? {};
// El Trabajador es personal interno, no un cliente.
//
// Antes acá se preguntaba `role === "admin"`, o sea SOLO el Gerente. Un
// Trabajador caía por la rama de cliente y, como no tiene clienteId (ver
// crearTrabajadorAcceso.ts), no cumplía ninguna comprobación de
// pertenencia: no podía abrir NADA.
//
// Es el mismo desajuste que ya se corrigió en firestore.rules, que ahora
// deja al Trabajador leer clientes, contratos, facturas e informes con
// esPersonalDePortal(). Las reglas decían que sí y las Functions decían
// que no: un Trabajador generaba un reporte y después no podía verlo.
  const esInterno = esPersonalInterno(propio.role);
  const clienteIdPropio = String(propio.clienteId ?? "");

  const key = String(request.data?.key ?? "");
  const nombre = String(request.data?.nombre ?? "factura");
  if (!key || !esKeyValida(key)) {
    throw new HttpsError("invalid-argument", "Key inválida.");
  }

  if (!esInterno) {
    const facturaSnap = await db.collection("facturas").where("pdfUrl", "==", key).limit(1).get();
    if (facturaSnap.empty) {
      throw new HttpsError("permission-denied", "No tienes acceso a esta factura.");
    }
    const factura = facturaSnap.docs[0].data();
    let clienteIdFactura = String(factura.cliente_id ?? "");
    if (!clienteIdFactura && factura.cliente_doc) {
      const clienteSnap = await db.collection("clientes").where("ruc", "==", String(factura.cliente_doc)).limit(1).get();
      if (!clienteSnap.empty) clienteIdFactura = clienteSnap.docs[0].id;
    }
    if (!clienteIdFactura || clienteIdFactura !== clienteIdPropio) {
      throw new HttpsError("permission-denied", "No tienes acceso a esta factura.");
    }
  }

  const url = await firmarLecturaR2(key, EXPIRACION_SEGUNDOS, `${nombre}.pdf`);
  return { url };
});
