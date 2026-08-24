import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
/** Tope duro de la API de Firebase Cloud Messaging. */
const TOPE_TOKENS_POR_ENVIO = 500;

import { onSchedule } from "firebase-functions/v2/scheduler";
import { latir } from "./latidoDeTareas.js";

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
  // sendEachForMulticast acepta 500 como maximo. Los tokens ya se
  // limitan al guardarlos (ver guardarTokenPush), pero esto cubre los
  // datos que quedaron de antes de aquel arreglo: sin este recorte, una
  // sola cuenta con el array crecido tumbaria el envio a TODAS las
  // demas de esa tanda.
  const aEnviar = tokens.slice(0, TOPE_TOKENS_POR_ENVIO);

  const respuesta = await getMessaging().sendEachForMulticast({
    tokens: aEnviar,
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
        tokensInvalidos.push(aEnviar[i]);
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
 * Igual que enviarPushACliente pero para la cuenta admin -- se manda a
 * TODOS los portalUsers con role:"admin" (normalmente es una sola
 * cuenta, pero si en el futuro hay más de un admin, les llega a todos).
 * Reusa el mismo mecanismo de limpieza de tokens invalidos.
 */
export async function enviarPushAAdmin(payload: PushPayload): Promise<void> {
  const db = getFirestore();
  const adminsSnap = await db.collection("portalUsers").where("role", "==", "admin").get();

  const tokens: string[] = [];
  adminsSnap.docs.forEach((docSnap) => {
    const lista = docSnap.data()?.fcmTokens;
    if (Array.isArray(lista)) tokens.push(...lista.filter((t) => typeof t === "string" && t));
  });
  if (tokens.length === 0) return;
  // sendEachForMulticast acepta 500 como maximo. Los tokens ya se
  // limitan al guardarlos (ver guardarTokenPush), pero esto cubre los
  // datos que quedaron de antes de aquel arreglo: sin este recorte, una
  // sola cuenta con el array crecido tumbaria el envio a TODAS las
  // demas de esa tanda.
  const aEnviar = tokens.slice(0, TOPE_TOKENS_POR_ENVIO);

  const respuesta = await getMessaging().sendEachForMulticast({
    tokens: aEnviar,
    notification: { title: payload.title, body: payload.body },
    data: { url: payload.url || "/" },
    webpush: {
      fcmOptions: { link: payload.url || "/" },
      notification: { icon: "/icon-192.png" },
    },
  });

  const tokensInvalidos: string[] = [];
  respuesta.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code || "";
      if (code.includes("registration-token-not-registered") || code.includes("invalid-argument")) {
        tokensInvalidos.push(aEnviar[i]);
      }
    }
  });
  if (tokensInvalidos.length > 0) {
    const batch = db.batch();
    adminsSnap.docs.forEach((docSnap) => {
      const lista: string[] = Array.isArray(docSnap.data()?.fcmTokens) ? docSnap.data()!.fcmTokens : [];
      const limpios = lista.filter((t) => !tokensInvalidos.includes(t));
      if (limpios.length !== lista.length) {
        batch.set(docSnap.ref, { fcmTokens: limpios }, { merge: true });
      }
    });
    await batch.commit().catch(() => undefined);
  }
}

function nombreMesLargo(mes: string) {
  const [year, month] = mes.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  const label = new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "Hoy", pero como se ve de verdad en Lima -- Cloud Functions corre
 *  en UTC por defecto, así que un simple new Date().toISOString()
 *  puede estar hasta 5 horas adelantado (Lima es UTC-5), corriéndose
 *  de día entero cerca de la medianoche. Esto usa el timezone real en
 *  vez de asumir la hora del servidor, así los recordatorios no
 *  dependen de a qué hora exacta del día corra la función. */
function hoyEnLima(): { anio: number; mes: number; dia: number; str: string } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  const anio = valor("year");
  const mes = valor("month");
  const dia = valor("day");
  return { anio, mes, dia, str: `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}` };
}

/** Suma (o resta, con un número negativo) días de calendario a una
 *  fecha Y/M/D y devuelve "YYYY-MM-DD" -- se apoya en Date.UTC para
 *  que el acarreo de mes/año (fin de mes, fin de año) lo resuelva el
 *  propio motor de JS en vez de calcularlo a mano. */
function sumarDias(base: { anio: number; mes: number; dia: number }, dias: number): string {
  const d = new Date(Date.UTC(base.anio, base.mes - 1, base.dia + dias));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Nombre de campaña para el mensaje -- el que puso el admin a mano, o
 *  si no tiene, cae al nombre del panel principal. */
async function nombreDeCampana(db: FirebaseFirestore.Firestore, data: FirebaseFirestore.DocumentData): Promise<string> {
  if (typeof data.nombre === "string" && data.nombre.trim()) return data.nombre.trim();
  const panelIds: string[] = Array.isArray(data.panel_ids) && data.panel_ids.length > 0
    ? data.panel_ids
    : (data.panel_id ? [data.panel_id] : []);
  const nombresPaneles = await Promise.all(
    panelIds.map(async (panelId) => {
      const panelSnap = await db.doc(`paneles/${panelId}`).get();
      return panelSnap.exists ? String(panelSnap.data()?.nombre || "") : "";
    })
  );
  return nombresPaneles.filter(Boolean).join(" + ") || "una campaña";
}

/** Nombre de la empresa del cliente dueño de una campaña. */
async function nombreDeCliente(db: FirebaseFirestore.Firestore, clienteId: string): Promise<string> {
  if (!clienteId) return "Un cliente";
  const snap = await db.doc(`clientes/${clienteId}`).get();
  const empresa = snap.exists ? String(snap.data()?.empresa || "") : "";
  return empresa || "Un cliente";
}

/**
 * Recordatorio de reportes mensuales -- el admin pidió que la app le
 * avise en los ÚLTIMOS 7 DÍAS de cada mes (calculado según cuántos
 * días tiene ese mes, no un número de día fijo -- antes eran 5 días)
 * si todavía le falta generar el informe mensual de alguna campaña
 * activa. Corre todos los días junto con el resto de recordatorios,
 * pero solo manda el push si:
 *   1. Hoy cae dentro de los últimos 7 días del mes, Y
 *   2. Hay al menos una campaña activa sin informe de este mes.
 * En cuanto ya generó el informe de TODAS sus campañas activas, deja
 * de mandarse solo (no hay que marcar nada a mano) -- y si vuelve a
 * faltar uno (por ejemplo agrega una campaña nueva a último momento),
 * el aviso vuelve a salir al día siguiente hasta que también quede
 * listo.
 *
 * Pedido explícito: en vez de UN solo push agrupando todas las
 * campañas pendientes ("Faltan 3 reportes mensuales: A, B, C"), ahora
 * manda UN push POR CADA campaña pendiente, y cada uno indica de qué
 * CLIENTE es (antes solo decía el nombre de la campaña, sin aclarar
 * la empresa) -- más fácil de actuar sobre cada uno por separado.
 */
export const recordatorioReportesMensuales = onSchedule(
  { schedule: "30 11 * * *", timeZone: "America/Lima", minInstances: 0, maxInstances: 1 },
  async () => {
    const db = getFirestore();
    // El latido va al PRINCIPIO, no al final: lo que se vigila es que la
    // tarea se EJECUTE. La mayoria de los dias no hay nada que enviar
    // (solo avisa en los ultimos 7 dias del mes), y una tarea que corre
    // y no encuentra trabajo esta perfectamente sana.
    await latir(db, "recordatorioReportesMensuales");
    const hoy = hoyEnLima();
    const hoyStr = hoy.str;
    const mesActual = hoyStr.slice(0, 7);
    const diasEnMes = new Date(Date.UTC(hoy.anio, hoy.mes, 0)).getUTCDate();
    const diaHoy = hoy.dia;

    // Solo en los últimos 7 días del mes (día >= diasEnMes - 6).
    if (diaHoy < diasEnMes - 6) return;

    // Campañas activas: mismo criterio que estadoCampana() en el
    // frontend (inicio <= hoy <= fin), sin contar las eliminadas.
    const contratosSnap = await db.collection("contratos").where("fin", ">=", hoyStr).get();
    const activos = contratosSnap.docs
      .map((d) => ({ id: d.id, data: d.data() }))
      .filter(({ data }) => {
        if (data.deleted) return false;
        if (typeof data.inicio !== "string" || data.inicio > hoyStr) return false;
        return true;
      });
    if (activos.length === 0) return;

    // Reportes ya generados este mes, por contrato_id.
    const informesSnap = await db.collection("informesCliente").where("mes", "==", mesActual).get();
    const contratosConReporte = new Set<string>();
    informesSnap.docs.forEach((d) => {
      const contratoId = d.data()?.contrato_id;
      if (typeof contratoId === "string" && contratoId) contratosConReporte.add(contratoId);
    });

    const pendientes = activos.filter(({ id }) => !contratosConReporte.has(id));
    if (pendientes.length === 0) return;

    const diasRestantes = diasEnMes - diaHoy + 1;
    const mesLabel = nombreMesLargo(mesActual);

    for (const { data } of pendientes) {
      const [nombreCampana, nombreCliente] = await Promise.all([
        nombreDeCampana(db, data),
        nombreDeCliente(db, String(data.cliente_id || "")),
      ]);
      await enviarPushAAdmin({
        title: "Falta 1 reporte mensual",
        body: `${nombreCliente} — ${nombreCampana}. Quedan ${diasRestantes} día${diasRestantes === 1 ? "" : "s"} de ${mesLabel}.`,
        url: "/",
      }).catch(() => undefined);
    }
  }
);

/**
 * Corre una vez al día, a las 3pm -- revisa qué campañas activas están
 * por vencer y manda DOS avisos por campaña (pedido explícito, antes
 * era uno solo dentro de una ventana de 7 días):
 *   1. A los 10 días antes de que termine.
 *   2. A los 5 días antes de que termine (el último aviso).
 * Cada uno se manda una sola vez -- se guardan por separado
 * (notificadoVencimiento10 / notificadoVencimiento5) para no repetir.
 * Si por algún motivo la función no corrió justo el día exacto (por
 * ejemplo estuvo caída), igual se pone al día apenas vuelve a correr:
 * revisa "¿ya pasó ese umbral y todavía no se avisó?", no "¿es HOY
 * exactamente ese día?" -- así nunca se salta un aviso por un problema
 * técnico puntual.
 *
 * Compatibilidad: contratos viejos que ya tenían el flag anterior
 * (notificadoVencimiento, sin número, de antes de este cambio) se
 * tratan como si ya hubieran recibido AMBOS avisos -- para no
 * bombardear con avisos nuevos de golpe a campañas que ya habían sido
 * notificadas con el sistema viejo.
 */
export const recordatorioVencimientoCampanas = onSchedule(
  { schedule: "0 15 * * *", timeZone: "America/Lima", minInstances: 0, maxInstances: 1 },
  async () => {
    const db = getFirestore();
    await latir(db, "recordatorioVencimientoCampanas");
    const hoyInfo = hoyEnLima();
    const hoy = hoyInfo.str;
    const limite = sumarDias(hoyInfo, 10);

    const contratosSnap = await db
      .collection("contratos")
      .where("fin", ">=", hoy)
      .where("fin", "<=", limite)
      .get();

    for (const docSnap of contratosSnap.docs) {
      const contrato = docSnap.data();
      if (contrato.deleted) continue;
      // Solo si ya empezó (si no, esta por INICIAR, no por vencer).
      if (typeof contrato.inicio === "string" && contrato.inicio > hoy) continue;

      const diasRestantes = Math.round(
        (new Date(`${contrato.fin}T00:00:00Z`).getTime() - new Date(`${hoy}T00:00:00Z`).getTime()) / 86400000
      );

      const yaNotificadoAntes = contrato.notificadoVencimiento === true; // flag viejo, sin número
      const tiene10 = yaNotificadoAntes || contrato.notificadoVencimiento10 === true;
      const tiene5 = yaNotificadoAntes || contrato.notificadoVencimiento5 === true;

      const necesita5 = diasRestantes <= 5 && !tiene5;
      const necesita10 = !necesita5 && diasRestantes <= 10 && !tiene10;
      if (!necesita5 && !necesita10) continue;

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
        body: `La campaña en ${nombrePanel} termina el ${contrato.fin} (quedan ${diasRestantes} día${diasRestantes === 1 ? "" : "s"}). Programa tu renovación desde el portal.`,
        url: "/",
      }).catch(() => undefined);

      // El aviso de 5 días cubre también el de 10 (si se saltó el
      // primero por algún motivo, no hace falta mandar los dos).
      const actualizacion: Record<string, boolean> = necesita5
        ? { notificadoVencimiento10: true, notificadoVencimiento5: true }
        : { notificadoVencimiento10: true };
      await docSnap.ref.set(actualizacion, { merge: true }).catch(() => undefined);
    }
  }
);
