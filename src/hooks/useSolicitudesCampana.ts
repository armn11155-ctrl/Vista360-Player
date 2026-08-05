import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../config/firebase";
import type { SolicitudCampana } from "../types";

export type SolicitudesCampanaState =
  | { status: "loading" }
  | { status: "ready"; solicitudes: SolicitudCampana[] }
  | { status: "error"; message: string };

/**
 * Solicitudes de campaña para la cuenta admin.
 *
 * ANTES ESTO ERA UNA BOMBA DE TIEMPO. La consulta era
 * `query(collection(db, "solicitudesCampana"))`: la colección ENTERA, sin
 * filtro, sin límite, y en vivo. Hoy no se nota porque hay pocas
 * solicitudes, pero esa colección solo crece -- una solicitud resuelta
 * hace tres años se seguía leyendo y pagando en cada sesión del admin.
 *
 * Con 1.000 clientes pidiendo ~20 campañas al año, a los cinco años son
 * 100.000 documentos leídos CADA VEZ que el admin abre la aplicación.
 * Una sola apertura gastaría el doble de la cuota diaria gratuita.
 *
 * AHORA SON DOS CONSULTAS ACOTADAS, y ninguna crece con los años:
 *
 *  1. Las PENDIENTES, todas. No lleva límite a propósito: esta lista se
 *     vacía sola porque el admin las resuelve. Si algún día creciera
 *     mucho, sería síntoma de trabajo atrasado, no de un problema
 *     técnico -- y esconder solicitudes sin atender sería peor.
 *
 *  2. Las YA RESUELTAS, solo las más recientes. Son un historial de
 *     consulta: nadie necesita ver la solicitud número 4.000 de hace
 *     cuatro años en una lista sin paginar.
 *
 * El resultado es el mismo que antes para todo uso real, pero el coste
 * deja de depender de la antigüedad del negocio.
 */

/** Estados que ya no requieren acción. Se listan explícitamente en vez
 *  de usar "distinto de Pendiente": Firestore no puede indexar una
 *  desigualdad junto con un orden por otro campo, y enumerarlos obliga a
 *  pasar por acá si algún día se añade un estado nuevo. */
const ESTADOS_RESUELTOS = ["Revisada", "Rechazada", "Convertida"] as const;

/** Cuántas resueltas se conservan a la vista. */
export const RESUELTAS_VISIBLES = 50;

function aSolicitud(d: { id: string; data: () => unknown }): SolicitudCampana {
  return { id: d.id, ...(d.data() as Omit<SolicitudCampana, "id">) };
}

function milisegundos(s: SolicitudCampana): number {
  return s.createdAt?.toMillis ? s.createdAt.toMillis() : 0;
}

export function useSolicitudesCampana(isAdmin: boolean): SolicitudesCampanaState {
  const [state, setState] = useState<SolicitudesCampanaState>({ status: "loading" });

  useEffect(() => {
    // Salir sin fijar estado dejaba el hook en "loading" PARA SIEMPRE:
    // la pantalla se quedaba con el spinner girando en vez de mostrar
    // algo. Cuando no hay nada que consultar, el resultado correcto es
    // "listo y vacío", no "cargando".
    if (!db || !isAdmin) { setState({ status: "ready", solicitudes: [] }); return; }

    // Cada escucha guarda SU parte. Se combinan al publicar, para que la
    // llegada de una no borre lo que ya trajo la otra.
    let pendientes: SolicitudCampana[] | null = null;
    let resueltas: SolicitudCampana[] | null = null;

    const publicar = () => {
      // Hasta que no hayan respondido las dos, seguir en "loading":
      // mostrar solo las pendientes por un instante haría parpadear la
      // pantalla como si el historial se hubiera vaciado.
      if (pendientes === null || resueltas === null) return;
      const solicitudes = [...pendientes, ...resueltas].sort(
        (a, b) => milisegundos(b) - milisegundos(a)
      );
      setState({ status: "ready", solicitudes });
    };

    const alFallar = (err: { message: string }) =>
      setState({ status: "error", message: err.message });

    const unsubPendientes = onSnapshot(
      query(collection(db, "solicitudesCampana"), where("estado", "==", "Pendiente")),
      (snap) => { pendientes = snap.docs.map(aSolicitud); publicar(); },
      alFallar
    );

    const unsubResueltas = onSnapshot(
      query(
        collection(db, "solicitudesCampana"),
        where("estado", "in", [...ESTADOS_RESUELTOS]),
        orderBy("createdAt", "desc"),
        limit(RESUELTAS_VISIBLES)
      ),
      (snap) => { resueltas = snap.docs.map(aSolicitud); publicar(); },
      alFallar
    );

    return () => { unsubPendientes(); unsubResueltas(); };
  }, [isAdmin]);

  return state;
}
