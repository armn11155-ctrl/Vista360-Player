import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

if (getApps().length === 0) {
  initializeApp();
}

/**
 * Notificaciones push (FCM) -- avisan al cliente aunque no tenga la
 * app abierta. Antes de esto, la campanita de notificaciones solo
 * existía DENTRO del portal: si el cliente no entraba, nunca se
 * enteraba de que su campaña estaba por vencer, o de que ya tenía un
 * reporte o una factura nueva.
 *
 * Todo lo de acá manda el push a los fcmTokens guardados en
 * portalUsers (uno o más por cliente, uno por dispositivo en el que
 * activó notificaciones desde el portal). Si un token ya no sirve
 * (el navegador lo invalidó, el cliente desinstaló la PWA, etc.), FCM
 * lo devuelve como error "no encontrado" -- se aprovecha esa misma
 * respuesta para limpiarlo de una vez, así la lista de tokens no
 * crece para siempre con basura.
 */

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export async function enviarPushACliente(clienteId: string, payload: PushPayload): Promise<void> {
  const db = getFirestore();
  const usuariosSnap = await db.collection("portalUsers").where("clienteId", "==", clienteId).get();

  const tokens: string[] = [];
  usuariosSnap.docs.forEach((docSnap) => {
    const lista = docSnap.data()?.fcmTokens;
    if (Array.isArray(lista)) tokens.push(...lista.filter((t) => typeof t === "string" && t));
  });
  if (tokens.length === 0) return;

  const respuesta = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: payload.title, body: payload.body },
    data: { url: payload.url || "/" },
    webpush: {
      fcmOptions: { link: payload.url || "/" },
      notification: { icon: "/icon-192.png" },
    },
  });

  // Tokens que FCM rechazó de plano (no solo un error de red pasajero)
  // -- esos ya no sirven, se quitan de portalUsers para no seguir
  // intentando mandarles nada.
  const tokensInvalidos: string[] = [];
  respuesta.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code || "";
      if (code.includes("registration-token-not-registered") || code.includes("invalid-argument")) {
        tokensInvalidos.push(tokens[i]);
      }
    }
  });
  if (tokensInvalidos.length > 0) {
    const batch = db.batch();
    usuariosSnap.docs.forEach((docSnap) => {
      const lista: string[] = Array.isArray(docSnap.data()?.fcmTokens) ? docSnap.data()!.fcmTokens : [];
      const limpios = lista.filter((t) => !tokensInvalidos.includes(t));
      if (limpios.length !== lista.length) {
        batch.set(docSnap.ref, { fcmTokens: limpios }, { merge: true });
      }
    });
    await batch.commit().catch(() => undefined);
  }
}

/**
 * Corre una vez al día -- revisa qué campañas activas están por vencer
 * (fin dentro de los próximos 7 días) y todavía no se avisaron, y
 * manda un push por cada una. Se marca notificadoVencimiento:true para
 * no volver a mandar el mismo aviso al día siguiente.
 */
export const recordatorioVencimientoCampanas = onSchedule(
  { schedule: "0 9 * * *", timeZone: "America/Lima" },
  async () => {
    const db = getFirestore();
    const hoy = new Date().toISOString().slice(0, 10);
    const limite = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    const contratosSnap = await db
      .collection("contratos")
      .where("fin", ">=", hoy)
      .where("fin", "<=", limite)
      .get();

    for (const docSnap of contratosSnap.docs) {
      const contrato = docSnap.data();
      if (contrato.notificadoVencimiento) continue;
      // Solo si ya empezó (si no, esta por INICIAR, no por vencer).
      if (typeof contrato.inicio === "string" && contrato.inicio > hoy) continue;
      const clienteId = String(contrato.cliente_id || "");
      if (!clienteId) continue;

      // Campaña multi-panel: junta los nombres de todos los paneles del
      // contrato, no solo el primero.
      const panelIdsContrato: string[] = Array.isArray(contrato.panel_ids) && contrato.panel_ids.length > 0
        ? contrato.panel_ids
        : (contrato.panel_id ? [contrato.panel_id] : []);
      const nombresPaneles = await Promise.all(
        panelIdsContrato.map(async (panelId) => {
          const panelSnap = await db.doc(`paneles/${panelId}`).get();
          return panelSnap.exists ? String(panelSnap.data()?.nombre || "") : "";
        })
      );
      const nombrePanel = nombresPaneles.filter(Boolean).join(" + ") || "tu panel";

      await enviarPushACliente(clienteId, {
        title: "Tu campaña está por vencer",
        body: `La campaña en ${nombrePanel} termina el ${contrato.fin}. Programa tu renovación desde el portal.`,
        url: "/",
      }).catch(() => undefined);

      await docSnap.ref.set({ notificadoVencimiento: true }, { merge: true }).catch(() => undefined);
    }
  }
);

/**
 * Se dispara solo cuando se genera un reporte mensual nuevo -- avisa
 * al cliente que ya está listo para ver/descargar.
 */
export const notificarReporteListo = onDocumentCreated("informesCliente/{id}", async (event) => {
  const data = event.data?.data();
  if (!data) return;
  const clienteId = String(data.cliente_id || "");
  if (!clienteId) return;
  const mesLabel = String(data.mesLabel || "tu campaña");
  await enviarPushACliente(clienteId, {
    title: "Tu reporte ya está listo",
    body: `Ya puedes ver tu reporte de ${mesLabel} en el portal.`,
    url: "/",
  }).catch(() => undefined);
});

/**
 * Se dispara con cualquier factura nueva -- tanto las que sube el
 * admin desde acá (crearFacturaAdmin) como las que llegan del sistema
 * de facturación (facturacion-web), que escribe directo a esta misma
 * colección "facturas". Por eso resuelve el cliente de dos formas:
 * por cliente_id directo (facturas subidas desde el portal) o por RUC
 * -> clientes.ruc -> clienteId (facturas del otro sistema).
 */
export const notificarFacturaNueva = onDocumentCreated("facturas/{id}", async (event) => {
  const data = event.data?.data();
  if (!data) return;

  const db = getFirestore();
  let clienteId = String(data.cliente_id || "");

  if (!clienteId && data.cliente_doc) {
    const clienteSnap = await db.collection("clientes").where("ruc", "==", String(data.cliente_doc)).limit(1).get();
    if (!clienteSnap.empty) clienteId = clienteSnap.docs[0].id;
  }
  if (!clienteId) return;

  const numero = String(data.numero_fmt || "una factura nueva");
  await enviarPushACliente(clienteId, {
    title: "Tienes una factura nueva",
    body: `${numero} ya está disponible en tu portal Vista360.`,
    url: "/",
  }).catch(() => undefined);
});
