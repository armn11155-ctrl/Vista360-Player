import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, Timestamp } from "firebase/firestore";
import { db } from "../config/firebase";
import type { Contrato } from "../types";

export interface Notificacion {
  id: string;
  tipo: "solicitud_pendiente" | "contrato_por_vencer" | "evidencia_nueva";
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
 * - Evidencias subidas en los últimos 7 días (fotos nuevas en sus campañas)
 */
export function useNotificaciones(clienteId: string): NotifState {
  const [state, setState] = useState<NotifState>({ status: "loading" });

  useEffect(() => {
    if (!clienteId || !db) return;

    const notifs: Map<string, Notificacion> = new Map();
    let solicitudesDone = false;
    let contratosDone = false;
    const hoyBase = new Date();

    function emitir() {
      if (!solicitudesDone || !contratosDone) return;
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
    const qSol = query(
      collection(db, "solicitudesCampana"),
      where("cliente_id", "==", clienteId)
    );
    const hace14 = new Date(hoyBase.getTime() - 14 * 86400000);
    const unsubSol = onSnapshot(qSol, (snap) => {
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
    }, () => { solicitudesDone = true; emitir(); });

    // ── Contratos por vencer (próximos 30 días) ───────────────────────────
    const hoy = hoyBase;
    const en30 = new Date(hoy.getTime() + 30 * 86400000);

    const qCon = query(
      collection(db, "contratos"),
      where("cliente_id", "==", clienteId)
    );
    const unsubCon = onSnapshot(qCon, (snap) => {
      for (const k of notifs.keys()) {
        if (k.startsWith("con-") || k.startsWith("evi-")) notifs.delete(k);
      }
      snap.docs.forEach((d) => {
        const data = d.data() as Contrato & Record<string, any>;
        if (data.deleted) return;

        // Contrato por vencer
        const fin = data.fin ? new Date(data.fin) : null;
        if (fin && fin >= hoy && fin <= en30) {
          const dias = Math.ceil((fin.getTime() - hoy.getTime()) / 86400000);
          notifs.set(`con-${d.id}`, {
            id: `con-${d.id}`,
            tipo: "contrato_por_vencer",
            titulo: "Campaña por vencer",
            detalle: `Tu campaña vence ${dias === 1 ? "mañana" : `en ${dias} días`}.`,
            fecha: fin.toISOString(),
          });
        }

        // Evidencias nuevas (últimos 7 días)
        const hace7 = new Date(hoy.getTime() - 7 * 86400000);
        (data.fotos_campania ?? []).forEach((f: { url: string; fecha: string }, i: number) => {
          const fechaFoto = new Date(f.fecha);
          if (fechaFoto >= hace7) {
            notifs.set(`evi-${d.id}-${i}`, {
              id: `evi-${d.id}-${i}`,
              tipo: "evidencia_nueva",
              titulo: "Nueva evidencia disponible",
              detalle: "Se subió una nueva foto de tu anuncio.",
              fecha: f.fecha,
            });
          }
        });
      });
      contratosDone = true;
      emitir();
    }, () => { contratosDone = true; emitir(); });

    return () => {
      unsubSol();
      unsubCon();
      window.removeEventListener(EVENTO_NOTIFICACIONES, alCambiarEstado);
    };
  }, [clienteId]);

  return state;
}
