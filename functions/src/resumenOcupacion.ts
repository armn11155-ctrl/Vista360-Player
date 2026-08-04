import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { modalidadDePanel } from "./modalidadPanel.js";

if (getApps().length === 0) {
  initializeApp();
}

/** "Hoy" en Lima -- Cloud Functions corre en UTC y cerca de medianoche
 *  se corre de día entero. Mismo criterio que el resto del proyecto. */
function hoyEnLima(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T12:00:00Z`);
  const b = Date.parse(`${hasta}T12:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/** Ventana para "se libera pronto": lo que hay que empezar a trabajar ya. */
const DIAS_POR_VENCER = 45;

interface ContratoDatos {
  cliente_id?: string;
  panel_id?: string;
  panel_ids?: string[];
  inicio?: string;
  fin?: string;
  monto?: number;
  nombre?: string;
  deleted?: boolean;
}

function panelesDe(c: ContratoDatos): string[] {
  if (Array.isArray(c.panel_ids) && c.panel_ids.length > 0) return c.panel_ids.map(String);
  return c.panel_id ? [String(c.panel_id)] : [];
}

/**
 * Foto de la ocupación real del inventario, para decidir a quién llamar.
 *
 * Responde tres preguntas que hoy no se pueden contestar desde ninguna
 * pantalla: qué pantallas están trabajando ahora, cuáles se liberan en
 * las próximas semanas (que es cuándo hay que salir a vender, no
 * cuando ya se vaciaron), y cuáles llevan tiempo sin facturar.
 *
 * Como las pantallas son digitales y rotan varios anuncios, "ocupado"
 * no es sí/no: lo que importa es CUÁNTOS anunciantes tiene cada una.
 * Por eso se devuelve el conteo por panel y no un booleano.
 *
 * Va del lado del servidor (Admin SDK) porque cruza los contratos de
 * TODOS los clientes, y las reglas de Firestore -- con razón -- no
 * dejan hacer esa lectura desde el navegador. Mismo patrón que
 * listarAccesosClientes.
 */
export const resumenOcupacion = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  if (!propio.exists || propio.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Solo la cuenta admin puede ver esto.");
  }

  const hoy = hoyEnLima();
  const limitePorVencer = sumarDias(hoy, DIAS_POR_VENCER);

  // Se acotan las dos colecciones que crecen sin techo (contratos y
  // facturas): leerlas enteras hacía que el coste y la latencia de esta
  // pantalla subieran en línea recta con los años de historial, y se
  // pagaba completo en cada apertura.
  //
  // Un año hacia atrás alcanza de sobra: para la ocupación solo importa
  // lo vigente, y "hace cuánto está libre un panel" con un tope de un año
  // dice lo mismo en la práctica ("más de un año" y "hace 3 años" llevan
  // a la misma decisión). Las facturas viejas ya cobradas tampoco
  // aportan nada a la cobranza.
  const desde = sumarDias(hoy, -365);

  const [panelesSnap, contratosSnap, clientesSnap, facturasSnap] = await Promise.all([
    db.collection("paneles").get(),
    db.collection("contratos").where("fin", ">=", desde).get(),
    db.collection("clientes").get(),
    db.collection("facturas").get(),
  ]);

  const nombreCliente = new Map<string, string>();
  clientesSnap.docs.forEach((d) => {
    nombreCliente.set(d.id, String(d.data()?.empresa ?? "Cliente"));
  });

  const contratos = contratosSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as ContratoDatos) }))
    .filter((c) => !c.deleted && typeof c.inicio === "string" && typeof c.fin === "string");

  // ── Por panel: quién está al aire, qué se vence, hace cuánto está libre ──
  interface OcupanteInfo {
    contratoId: string;
    clienteId: string;
    clienteNombre: string;
    campana: string;
    inicio: string;
    fin: string;
    monto: number;
    diasRestantes: number;
  }

  const activosPorPanel = new Map<string, OcupanteInfo[]>();
  const programadosPorPanel = new Map<string, OcupanteInfo[]>();
  const ultimoFinPorPanel = new Map<string, string>();

  contratos.forEach((c) => {
    const inicio = c.inicio!;
    const fin = c.fin!;
    const info: OcupanteInfo = {
      contratoId: c.id,
      clienteId: String(c.cliente_id ?? ""),
      clienteNombre: nombreCliente.get(String(c.cliente_id ?? "")) ?? "Cliente",
      campana: String(c.nombre ?? ""),
      inicio,
      fin,
      monto: Number(c.monto ?? 0) || 0,
      diasRestantes: diasEntre(hoy, fin),
    };
    panelesDe(c).forEach((panelId) => {
      if (inicio <= hoy && hoy <= fin) {
        activosPorPanel.set(panelId, [...(activosPorPanel.get(panelId) ?? []), info]);
      } else if (inicio > hoy) {
        programadosPorPanel.set(panelId, [...(programadosPorPanel.get(panelId) ?? []), info]);
      } else if (fin < hoy) {
        const previo = ultimoFinPorPanel.get(panelId);
        if (!previo || fin > previo) ultimoFinPorPanel.set(panelId, fin);
      }
    });
  });

  const paneles = panelesSnap.docs.map((d) => {
    const p = d.data() ?? {};
    const activos = activosPorPanel.get(d.id) ?? [];
    const programados = programadosPorPanel.get(d.id) ?? [];
    const ultimoFin = ultimoFinPorPanel.get(d.id) ?? null;
    const proximoVencimiento = activos.length
      ? activos.reduce((min, a) => (a.fin < min ? a.fin : min), activos[0].fin)
      : null;

    return {
      id: d.id,
      nombre: String(p.nombre ?? d.id),
      ciudad: String(p.ciudad ?? ""),
      estado: String(p.estado ?? ""),
      enMantenimiento: p.estado === "Mantenimiento",
      // "led" rota anuncios (varios clientes a la vez); "lona" es una
      // pieza física y solo admite uno. Cambia cómo se lee la ocupación:
      // en una lona, 1 anunciante ya significa LLENA; en una LED,
      // significa que todavía queda espacio para vender.
      modalidad: modalidadDePanel(p),
      impactoDiario: Number(p.impactoDiario ?? 0) || 0,
      anunciantesActivos: activos.length,
      anunciantesProgramados: programados.length,
      ingresoActivo: activos.reduce((t, a) => t + a.monto, 0),
      proximoVencimiento,
      // Solo tiene sentido si está vacío AHORA y alguna vez tuvo campaña.
      diasLibre: activos.length === 0 && ultimoFin ? diasEntre(ultimoFin, hoy) : null,
      nuncaContratado: activos.length === 0 && !ultimoFin && programados.length === 0,
      ocupantes: activos
        .slice()
        .sort((a, b) => a.fin.localeCompare(b.fin))
        .map((a) => ({
          clienteId: a.clienteId,
          clienteNombre: a.clienteNombre,
          campana: a.campana,
          fin: a.fin,
          diasRestantes: a.diasRestantes,
          monto: a.monto,
        })),
    };
  });

  paneles.sort(
    (a, b) =>
      (a.ciudad || "").localeCompare(b.ciudad || "") || a.nombre.localeCompare(b.nombre)
  );

  // ── Lista de llamadas: lo que se libera dentro de la ventana ──
  const porVencer = paneles
    .flatMap((panel) =>
      panel.ocupantes
        .filter((o) => o.fin <= limitePorVencer)
        .map((o) => ({
          panelId: panel.id,
          panelNombre: panel.nombre,
          ciudad: panel.ciudad,
          clienteId: o.clienteId,
          clienteNombre: o.clienteNombre,
          campana: o.campana,
          fin: o.fin,
          diasRestantes: o.diasRestantes,
          monto: o.monto,
        }))
    )
    .sort((a, b) => a.diasRestantes - b.diasRestantes);

  // ── Inventario parado: vacío hoy, del que lleva más tiempo así ──
  const libres = paneles
    .filter((p) => p.anunciantesActivos === 0 && !p.enMantenimiento)
    .sort((a, b) => (b.diasLibre ?? 99999) - (a.diasLibre ?? 99999));

  // ── Cobranza: qué está emitido y sin cobrar ──────────────────────
  // Las facturas vienen del sistema de facturación externo y se vinculan
  // por RUC (cliente_doc) o, si el cliente no tiene RUC cargado allá, por
  // cliente_id directo. Se resuelven las dos formas para no dejar fuera
  // ninguna deuda real.
  const clientePorRuc = new Map<string, string>();
  clientesSnap.docs.forEach((d) => {
    const ruc = String(d.data()?.ruc ?? "").trim();
    if (ruc) clientePorRuc.set(ruc, d.id);
  });

  const COBRADAS = new Set(["Pagada", "Anulada"]);
  const pendientes = facturasSnap.docs
    .map((d) => ({ id: d.id, datos: d.data() as Record<string, unknown> }))
    .filter(({ datos }) => {
      if (datos.pagado === true) return false;
      return !COBRADAS.has(String(datos.estado ?? ""));
    })
    .map(({ id, datos: f }) => {
      const clienteId =
        String(f.cliente_id ?? "") ||
        clientePorRuc.get(String(f.cliente_doc ?? "").trim()) ||
        "";
      const vence = String(f.fecha_vencimiento ?? "").slice(0, 10);
      return {
        id,
        numero: String(f.numero_fmt ?? f.numero ?? f.id),
        clienteId,
        clienteNombre: nombreCliente.get(clienteId) ?? "Cliente sin identificar",
        estado: String(f.estado ?? ""),
        total: Number(f.total ?? 0) || 0,
        moneda: String(f.moneda ?? "PEN"),
        vence: vence || null,
        // Negativo = ya se pasó la fecha de vencimiento.
        diasParaVencer: vence ? diasEntre(hoy, vence) : null,
        vencida: Boolean(vence && vence < hoy),
      };
    })
    // Primero lo más vencido, después lo que vence antes.
    .sort((a, b) => (a.diasParaVencer ?? 9999) - (b.diasParaVencer ?? 9999));

  const cobranza = {
    facturas: pendientes,
    total: pendientes.reduce((t, f) => t + f.total, 0),
    vencidas: pendientes.filter((f) => f.vencida).length,
    totalVencido: pendientes.filter((f) => f.vencida).reduce((t, f) => t + f.total, 0),
  };

  const operativos = paneles.filter((p) => !p.enMantenimiento);
  const conAnunciante = operativos.filter((p) => p.anunciantesActivos > 0);
  // Una LED con un solo anunciante sigue teniendo hueco que vender; una
  // lona con uno ya está tomada. Por eso "con espacio libre" no es lo
  // mismo que "sin anunciante", y conviene verlo aparte.
  const ledConEspacio = operativos.filter((p) => p.modalidad === "led" && p.anunciantesActivos > 0);
  const lonas = operativos.filter((p) => p.modalidad === "lona");
  const lonasLibres = lonas.filter((p) => p.anunciantesActivos === 0);
  // Unipolar: impreso de DOS caras -- con menos de 2 anunciantes activos
  // todavía le queda una cara libre para vender (a diferencia de la
  // lona, que con 1 solo ya está completa).
  const unipolares = operativos.filter((p) => p.modalidad === "unipolar");
  const unipolaresConEspacio = unipolares.filter((p) => p.anunciantesActivos < 2);

  return {
    hoy,
    ventanaDias: DIAS_POR_VENCER,
    totales: {
      paneles: paneles.length,
      operativos: operativos.length,
      enMantenimiento: paneles.length - operativos.length,
      trabajando: conAnunciante.length,
      libres: operativos.length - conAnunciante.length,
      // % de pantallas operativas que hoy tienen al menos un anunciante.
      ocupacionPct: operativos.length
        ? Math.round((conAnunciante.length / operativos.length) * 100)
        : 0,
      anunciantesActivos: paneles.reduce((t, p) => t + p.anunciantesActivos, 0),
      ingresoActivo: paneles.reduce((t, p) => t + p.ingresoActivo, 0),
      seLiberanEnVentana: porVencer.length,
      lonas: lonas.length,
      lonasLibres: lonasLibres.length,
      ledConEspacio: ledConEspacio.length,
      unipolares: unipolares.length,
      unipolaresConEspacio: unipolaresConEspacio.length,
    },
    paneles,
    porVencer,
    libres,
    cobranza,
  };
});
