import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

  const [panelesSnap, contratosSnap, clientesSnap] = await Promise.all([
    db.collection("paneles").get(),
    db.collection("contratos").get(),
    db.collection("clientes").get(),
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

  const operativos = paneles.filter((p) => !p.enMantenimiento);
  const conAnunciante = operativos.filter((p) => p.anunciantesActivos > 0);

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
    },
    paneles,
    porVencer,
    libres,
  };
});
