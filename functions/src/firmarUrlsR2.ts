import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { R2_SECRETS, esKeyValida, firmarLecturaR2 } from "./r2Storage.js";

if (getApps().length === 0) {
  initializeApp();
}

interface FirmarUrlsR2Data {
  keys?: string[];
}

const MAX_KEYS_POR_LLAMADA = 60;
// 6 horas: suficiente para que el cliente navegue toda la sesión sin
// re-firmar a cada rato, pero sin dejar links "eternos" dando vueltas.
const EXPIRACION_SEGUNDOS = 6 * 60 * 60;

/**
 * Firma URLs de LECTURA (GET) para archivos privados en R2. Quien pide
 * las URLs debe estar autenticado y tener una fila en portalUsers.
 *
 * Para las FACTURAS se verifica además de quién es cada archivo. Antes
 * no se hacía: bastaba con que la key empezara con "vista360/facturas/"
 * para firmarla, apoyándose en que un cliente "nunca llega a conocer
 * una key que no sea suya" -- seguridad por oscuridad, y encima
 * inconsistente, porque firmarDescargaFactura (la otra puerta al mismo
 * archivo) sí valida al dueño con cuidado. Ahora las dos hacen lo
 * mismo: el admin puede firmar cualquiera, y un cliente solo las
 * facturas que le corresponden por cliente_id o por RUC.
 *
 * Las otras carpetas (campañas, avatares) no llevan datos financieros
 * y sus keys viven dentro de documentos que Firestore Rules ya limita
 * por cliente, así que se firman con la validación de carpeta de
 * siempre.
 */
export const firmarUrlsR2 = onCall({ secrets: R2_SECRETS }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const snap = await db.doc(`portalUsers/${uid}`).get();
  if (!snap.exists) {
    throw new HttpsError("permission-denied", "Tu cuenta no está vinculada al portal.");
  }

  const keysRaw = request.data?.keys;
  if (!Array.isArray(keysRaw) || keysRaw.length === 0) {
    throw new HttpsError("invalid-argument", "Envía un arreglo de keys.");
  }
  if (keysRaw.length > MAX_KEYS_POR_LLAMADA) {
    throw new HttpsError("invalid-argument", `Máximo ${MAX_KEYS_POR_LLAMADA} keys por llamada.`);
  }

  const keys = keysRaw.map((k) => String(k)).filter(esKeyValida);

  const propio = snap.data() ?? {};
  const esAdmin = propio.role === "admin";
  const clienteIdPropio = String(propio.clienteId ?? "");

  /** ¿Esta factura es del cliente que la está pidiendo? Misma lógica
   *  que firmarDescargaFactura: por cliente_id directo, o por el RUC
   *  (cliente_doc) que usa el sistema de facturación externo. */
  async function facturaEsDelCliente(key: string): Promise<boolean> {
    const facturaSnap = await db.collection("facturas").where("pdfUrl", "==", key).limit(1).get();
    if (facturaSnap.empty) return false;
    const factura = facturaSnap.docs[0].data();
    let clienteIdFactura = String(factura.cliente_id ?? "");
    if (!clienteIdFactura && factura.cliente_doc) {
      const clienteSnap = await db
        .collection("clientes")
        .where("ruc", "==", String(factura.cliente_doc))
        .limit(1)
        .get();
      if (!clienteSnap.empty) clienteIdFactura = clienteSnap.docs[0].id;
    }
    return Boolean(clienteIdFactura) && clienteIdFactura === clienteIdPropio;
  }

  const permitidas = esAdmin
    ? keys
    : (
        await Promise.all(
          keys.map(async (key) =>
            key.startsWith("vista360/facturas/") && !(await facturaEsDelCliente(key)) ? null : key
          )
        )
      ).filter((k): k is string => k !== null);

  const firmadas = await Promise.all(
    permitidas.map(async (key) => ({
      key,
      url: await firmarLecturaR2(key, EXPIRACION_SEGUNDOS),
    }))
  );

  // Las keys que no pasaron el filtro simplemente no vuelven en la
  // respuesta -- el frontend ya trata "sin URL firmada" como "no hay
  // nada que mostrar", así que no rompe nada, y no se le confirma a
  // quien pregunta si esa factura existe o no.
  return { urls: firmadas };
});
