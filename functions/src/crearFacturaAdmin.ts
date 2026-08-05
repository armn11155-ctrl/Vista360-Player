import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) {
  initializeApp();
}

interface CrearFacturaAdminData {
  ruc?: string;
  clienteId?: string;
  numeroFmt?: string;
  pdfUrl?: string;
  pdfPesoBytes?: number;
  pdfPesoOriginalBytes?: number;
  /** Campaña (contrato) a la que corresponde -- opcional, para que
   *  el detalle de esa campaña pueda mostrar un acceso directo a su
   *  factura. Nunca lo tienen las facturas sincronizadas por RUC
   *  desde el sistema externo, solo las que se suben desde acá. */
  contratoId?: string;
  contratoNombre?: string;
}

function limpiar(value?: string) {
  return value?.trim() ?? "";
}

/**
 * Sube el registro de una factura a Firestore usando Admin SDK.
 *
 * La coleccion "facturas" pertenece a facturacion-web (un sistema
 * aparte que comparte este mismo proyecto de Firebase) -- sus reglas
 * de seguridad no le dan permiso de ESCRITURA a las cuentas admin de
 * Vista360 Player, aunque si les dejan leer. Por eso subir un PDF
 * desde aca (addDoc directo del cliente) fallaba con "permiso
 * denegado": esta funcion evita el problema por completo escribiendo
 * con el SDK de administrador, que no pasa por esas reglas. Mismo
 * patron ya usado en administrarClienteAdmin.ts y crearClienteNuevo.ts.
 */
export const crearFacturaAdmin = onCall<CrearFacturaAdminData>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  if (!propio.exists || propio.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Solo la cuenta admin puede subir facturas.");
  }

  const ruc = limpiar(request.data.ruc);
  const clienteId = limpiar(request.data.clienteId);
  const numeroFmt = limpiar(request.data.numeroFmt);
  const pdfUrl = limpiar(request.data.pdfUrl);
  const contratoId = limpiar(request.data.contratoId);
  const contratoNombre = limpiar(request.data.contratoNombre);
  const pdfPesoBytes = Number(request.data.pdfPesoBytes ?? 0);
  const pdfPesoOriginalBytes = Number(request.data.pdfPesoOriginalBytes ?? pdfPesoBytes);

  // clienteId es OBLIGATORIO desde que la app dejó de consultar las
  // facturas por RUC (ver useFacturas.ts). Antes bastaba con uno de los
  // dos: si llegaba solo el RUC, la factura se guardaba sin cliente_id y
  // el cliente la veía igual gracias a la segunda consulta. Ahora esa
  // consulta ya no existe, así que una factura sin cliente_id quedaría
  // invisible para siempre, sin ningún error -- el peor tipo de fallo.
  // Mejor rechazarla acá, ruidosamente, que guardarla rota en silencio.
  if (!clienteId) {
    throw new HttpsError(
      "invalid-argument",
      "Falta el cliente de la factura. Sin él, el cliente no podría verla."
    );
  }
  if (!ruc && !clienteId) {
    throw new HttpsError("invalid-argument", "Falta el RUC o el cliente para asociar la factura.");
  }
  if (!pdfUrl) {
    throw new HttpsError("invalid-argument", "Falta el PDF de la factura.");
  }

  const hoy = new Date().toISOString().slice(0, 10);

  const facturaRef = await db.collection("facturas").add({
    ...(ruc ? { cliente_doc: ruc } : {}),
    ...(clienteId ? { cliente_id: clienteId } : {}),
    ...(contratoId ? { contrato_id: contratoId } : {}),
    ...(contratoNombre ? { contratoNombre } : {}),
    tipo_doc: "Factura",
    numero_fmt: numeroFmt || "Factura",
    estado: "Emitida",
    fecha_emision: hoy,
    moneda: "PEN",
    total: 0,
    pagado: false,
    pdfUrl,
    pdfPesoBytes,
    pdfPesoOriginalBytes,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, id: facturaRef.id };
});
