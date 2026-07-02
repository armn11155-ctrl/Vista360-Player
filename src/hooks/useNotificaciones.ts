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

    function emitir() {
      if (!solicitudesDone || !contratosDone) return;
      const lista = Array.from(notifs.values()).sort((a, b) =>
        b.fecha.localeCompare(a.fecha)
      );
      setState({ status: "ready", notifs: lista, total: lista.length });
    }

    // ── Solicitudes pendientes ────────────────────────────────────────────
    const qSol = query(
      collection(db, "solicitudesCampana"),
      where("cliente_id", "==", clienteId),
      where("estado", "==", "Pendiente")
    );
    const unsubSol = onSnapshot(qSol, (snap) => {
      // Limpiar las anteriores de este tipo
      for (const k of notifs.keys()) {
        if (k.startsWith("sol-")) notifs.delete(k);
      }
      snap.docs.forEach((d) => {
        const data = d.data();
        notifs.set(`sol-${d.id}`, {
          id: `sol-${d.id}`,
          tipo: "solicitud_pendiente",
          titulo: "Solicitud en revisión",
          detalle: `Tu solicitud "${data.nombre}" está siendo revisada por el equipo.`,
          fecha: data.createdAt?.toDate?.().toISOString() ?? new Date().toISOString(),
        });
      });
      solicitudesDone = true;
      emitir();
    }, () => { solicitudesDone = true; emitir(); });

    // ── Contratos por vencer (próximos 30 días) ───────────────────────────
    const hoy = new Date();
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
    };
  }, [clienteId]);

  return state;
}
