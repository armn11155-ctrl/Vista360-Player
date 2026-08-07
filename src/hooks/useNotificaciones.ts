import { useEffect, useState } from "react";
import { db } from "../config/firebase";
import type { Contrato, SolicitudCampana } from "../types";
import { diasHasta, soloFecha } from "../utils/fechas";

export interface Notificacion {
  id: string;
  tipo: "solicitud_pendiente" | "contrato_por_vencer";
  titulo: string;
  detalle: string;
  fecha: string; // ISO string
}

export type NotifState =
  | { status: "loading" }
  | { status: "ready"; notifs: Notificacion[]; total: number };

const EVENTO_NOTIFICACIONES = "vista360:notificaciones-estado";

function claveEstado(clienteId: string, tipo: "leidas" | "eliminadas") {
  return `vista360:notificaciones:${clienteId}:${tipo}`;
}

function leerIds(clienteId: string, tipo: "leidas" | "eliminadas") {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(claveEstado(clienteId, tipo)) ?? "[]"));
  } catch {
    return new Set<string>();
  }
}

function guardarIds(clienteId: string, tipo: "leidas" | "eliminadas", ids: Set<string>) {
  localStorage.setItem(claveEstado(clienteId, tipo), JSON.stringify(Array.from(ids)));
  window.dispatchEvent(new CustomEvent(EVENTO_NOTIFICACIONES, { detail: { clienteId } }));
}

export function marcarNotificacionesLeidas(clienteId: string, ids: string[]) {
  const leidas = leerIds(clienteId, "leidas");
  ids.forEach((id) => leidas.add(id));
  guardarIds(clienteId, "leidas", leidas);
}

export function eliminarNotificacion(clienteId: string, id: string) {
  const eliminadas = leerIds(clienteId, "eliminadas");
  eliminadas.add(id);
  guardarIds(clienteId, "eliminadas", eliminadas);
}

/**
 * Trae las notificaciones relevantes para el cliente:
 * - Solicitudes de campaña en estado "Pendiente" (el cliente las mandó y
 *   aún no recibieron respuesta)
 * - Contratos que vencen en los próximos 30 días
 */
/**
 * AHORRO: los contratos llegan por parámetro, NO se vuelven a consultar.
 *
 * Antes este hook abría su propia escucha sobre
 * `contratos where cliente_id == X` -- exactamente la misma consulta que
 * ya tenía abierta useContratos para la misma pantalla. O sea que cada
 * sesión de cliente leía TODAS sus campañas dos veces, y volvía a
 * pagarlas dos veces con cada cambio. Solo se usaban para saber cuáles
 * vencen en los próximos 30 días.
 *
 * Ahora se reciben ya cargadas desde App.tsx. Una escucha menos por
 * sesión, mismo resultado y además sin el desfase que podía haber entre
 * las dos copias.
 */
export function useNotificaciones(
  clienteId: string,
  contratos: Contrato[],
  solicitudes: SolicitudCampana[]
): NotifState {
  const [state, setState] = useState<NotifState>({ status: "loading" });

  useEffect(() => {
    if (!clienteId || !db) return;

    const notifs: Map<string, Notificacion> = new Map();
    let solicitudesDone = false;
    const hoyBase = new Date();

    function emitir() {
      if (!solicitudesDone) return;
      const eliminadas = leerIds(clienteId, "eliminadas");
      const leidas = leerIds(clienteId, "leidas");
      const lista = Array.from(notifs.values()).filter((n) => !eliminadas.has(n.id)).sort((a, b) =>
        b.fecha.localeCompare(a.fecha)
      );
      setState({ status: "ready", notifs: lista, total: lista.filter((n) => !leidas.has(n.id)).length });
    }

    const alCambiarEstado = (event: Event) => {
      const detalle = (event as CustomEvent<{ clienteId?: string }>).detail;
      if (!detalle?.clienteId || detalle.clienteId === clienteId) emitir();
    };
    window.addEventListener(EVENTO_NOTIFICACIONES, alCambiarEstado);

    // ── Solicitudes: pendientes (aún esperando respuesta) + resueltas
    //    recientemente (el cliente merece saber qué pasó, no que la
    //    notificación simplemente desaparezca) ─────────────────────────
    //
    // YA NO SE CONSULTAN: LLEGAN COMO PARAMETRO.
    //
    // Historia corta de esta linea. Primero era `where("cliente_id")` a
    // secas: TODAS las solicitudes del cliente desde siempre, en cada
    // sesion, para mostrar dos. Despues se acoto a dos consultas
    // (pendientes + resueltas de 14 dias). Ahora son CERO consultas: las
    // solicitudes viajan dentro del documento resumen del cliente, que la
    // sesion ya paga para las campanas.
    //
    // El filtro por fecha se sigue haciendo ACA y no en el resumen: "de
    // los ultimos 14 dias" depende del dia de hoy, y un documento que
    // dependiera del calendario se quedaria desfasado a medianoche sin
    // que nadie escribiera nada.
    const hace14 = new Date(hoyBase.getTime() - 14 * 86400000);

    const procesarSolicitudes = () => {
      const snap = { docs: solicitudes.map((s) => ({ id: s.id, data: () => s as Record<string, any> })) };
      // Limpiar las anteriores de este tipo
      for (const k of notifs.keys()) {
        if (k.startsWith("sol-")) notifs.delete(k);
      }
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.estado === "Pendiente") {
          notifs.set(`sol-${d.id}`, {
            id: `sol-${d.id}`,
            tipo: "solicitud_pendiente",
            titulo: "Solicitud en revisión",
            detalle: `Tu solicitud "${data.nombre}" está siendo revisada por el equipo.`,
            fecha: data.createdAt?.toDate?.().toISOString() ?? new Date().toISOString(),
          });
          return;
        }
        // Resuelta (Revisada / Rechazada / Convertida): avisar solo si
        // el cambio fue reciente, para no llenar la lista de historial viejo.
        const actualizadaEn = data.estadoActualizadoEn?.toDate?.();
        if (actualizadaEn && actualizadaEn >= hace14) {
          const mensajes: Record<string, string> = {
            Rechazada: `Tu solicitud "${data.nombre}" fue rechazada. Contáctanos si tienes dudas.`,
            Revisada: `Tu solicitud "${data.nombre}" fue revisada por el equipo.`,
            Convertida: `¡Tu solicitud "${data.nombre}" ya es una campaña activa!`,
          };
          notifs.set(`sol-${d.id}`, {
            id: `sol-${d.id}`,
            tipo: "solicitud_pendiente",
            titulo: data.estado === "Rechazada" ? "Solicitud rechazada" : "Solicitud actualizada",
            detalle: mensajes[data.estado] ?? `Tu solicitud "${data.nombre}" cambió de estado.`,
            fecha: actualizadaEn.toISOString(),
          });
        }
      });
      solicitudesDone = true;
      emitir();
    };

    procesarSolicitudes();
    const unsubSol = () => {};

    // ── Contratos por vencer (próximos 30 días) ───────────────────────────
    // Sin consulta: se recorren los que ya vienen cargados.
    contratos.forEach((data) => {
      if (data.deleted) return;
      // Se compara por día calendario en Perú (utils/fechas), no con
      // objetos Date: "2026-07-31" se interpretaba como medianoche UTC y
      // el aviso salía con un día de desfase, además de desaparecer
      // mientras la campaña todavía estaba corriendo su último día.
      const fin = soloFecha(data.fin);
      if (!fin) return;
      const dias = diasHasta(fin);
      if (dias < 0 || dias > 30) return;
      notifs.set(`con-${data.id}`, {
        id: `con-${data.id}`,
        tipo: "contrato_por_vencer",
        titulo: "Campaña por vencer",
        detalle:
          dias === 0
            ? "Tu campaña vence hoy."
            : `Tu campaña vence ${dias === 1 ? "mañana" : `en ${dias} días`}.`,
        fecha: `${fin}T00:00:00.000Z`,
      });
    });

    return () => {
      unsubSol();
      window.removeEventListener(EVENTO_NOTIFICACIONES, alCambiarEstado);
    };
  }, [clienteId, contratos, solicitudes]);

  return state;
}
