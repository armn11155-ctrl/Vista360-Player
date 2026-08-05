import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  Timestamp,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../config/firebase";
import type { Contrato } from "../types";
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
export function useNotificaciones(clienteId: string, contratos: Contrato[]): NotifState {
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
    // ANTES ESTO LEIA TODAS LAS SOLICITUDES DEL CLIENTE, DESDE SIEMPRE.
    // La consulta era `where("cliente_id", "==", clienteId)` a secas, y
    // despues se descartaba en el navegador casi todo lo que llegaba: de
    // las resueltas solo interesan las de los ultimos 14 dias, y aun asi
    // se pagaban las de hace cinco anios en CADA sesion del cliente.
    //
    // Ahora se piden solo las dos cosas que se usan. El resultado que ve
    // la persona es identico -- lo que cambia es que el filtro lo hace
    // Firestore en vez del navegador, y por tanto no se cobra lo que se
    // iba a tirar. El coste deja de crecer con la antiguedad del cliente.
    const hace14 = new Date(hoyBase.getTime() - 14 * 86400000);
    const qPendientes = query(
      collection(db, "solicitudesCampana"),
      where("cliente_id", "==", clienteId),
      where("estado", "==", "Pendiente")
    );
    const qResueltasRecientes = query(
      collection(db, "solicitudesCampana"),
      where("cliente_id", "==", clienteId),
      where("estadoActualizadoEn", ">=", Timestamp.fromDate(hace14))
    );

    // Cada escucha trae su parte; se juntan antes de recorrerlas para no
    // borrar las notificaciones de la otra al limpiar las "sol-".
    let solPendientes: QueryDocumentSnapshot[] | null = null;
    let solRecientes: QueryDocumentSnapshot[] | null = null;

    const procesarSolicitudes = () => {
      if (solPendientes === null || solRecientes === null) return;
      // Una solicitud resuelta HOY sale en las dos consultas: se
      // deduplica por id para no contar la misma notificacion dos veces.
      const porId = new Map<string, QueryDocumentSnapshot>();
      [...solPendientes, ...solRecientes].forEach((d) => porId.set(d.id, d));
      const snap = { docs: [...porId.values()] };
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

    const alFallarSolicitudes = () => { solicitudesDone = true; emitir(); };
    const unsubSolPendientes = onSnapshot(
      qPendientes,
      (snap) => { solPendientes = snap.docs; procesarSolicitudes(); },
      alFallarSolicitudes
    );
    const unsubSolRecientes = onSnapshot(
      qResueltasRecientes,
      (snap) => { solRecientes = snap.docs; procesarSolicitudes(); },
      alFallarSolicitudes
    );
    const unsubSol = () => { unsubSolPendientes(); unsubSolRecientes(); };

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
  }, [clienteId, contratos]);

  return state;
}
