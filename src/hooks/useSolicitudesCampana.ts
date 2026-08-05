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
 * `query(collection(bd, "solicitudesCampana"))`: la colección ENTERA, sin
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

/** Firestore avisa de un indice compuesto que falta con este codigo.
 *  Es lo unico que distingue "hay que crear el indice" de un fallo real
 *  de permisos o de red, que si deben mostrarse como error. */
function esFaltaDeIndice(err: unknown): boolean {
  const codigo = (err as { code?: string } | null)?.code ?? "";
  return codigo === "failed-precondition";
}

function aSolicitud(d: { id: string; data: () => unknown }): SolicitudCampana {
  return { id: d.id, ...(d.data() as Omit<SolicitudCampana, "id">) };
}

function milisegundos(s: SolicitudCampana): number {
  return s.createdAt?.toMillis ? s.createdAt.toMillis() : 0;
}

/**
 * SOLO las pendientes. Es lo único que necesita el contador del selector
 * y de la barra lateral: un número.
 *
 * Antes esas pantallas usaban useSolicitudesCampana entero, o sea que
 * cargaban también las 50 resueltas -- 50 documentos por cada inicio de
 * sesión, para pintar un "3" en un círculo rojo. El historial solo hace
 * falta DENTRO de la pantalla de Solicitudes, y allí se sigue cargando.
 *
 * Sigue siendo en vivo: el contador se actualiza solo al llegar una
 * solicitud nueva o al resolver una, igual que antes. Y las pendientes
 * son pocas por naturaleza -- se vacían porque alguien las atiende.
 */
export function useSolicitudesPendientes(isAdmin: boolean): SolicitudesCampanaState {
  const [state, setState] = useState<SolicitudesCampanaState>({ status: "loading" });

  useEffect(() => {
    if (!db || !isAdmin) { setState({ status: "ready", solicitudes: [] }); return; }
    const bd = db;
    return onSnapshot(
      query(collection(bd, "solicitudesCampana"), where("estado", "==", "Pendiente")),
      (snap) => setState({ status: "ready", solicitudes: snap.docs.map(aSolicitud) }),
      (err) => setState({ status: "error", message: err.message })
    );
  }, [isAdmin]);

  return state;
}

export function useSolicitudesCampana(isAdmin: boolean): SolicitudesCampanaState {
  const [state, setState] = useState<SolicitudesCampanaState>({ status: "loading" });

  useEffect(() => {
    // Salir sin fijar estado dejaba el hook en "loading" PARA SIEMPRE:
    // la pantalla se quedaba con el spinner girando en vez de mostrar
    // algo. Cuando no hay nada que consultar, el resultado correcto es
    // "listo y vacío", no "cargando".
    if (!db || !isAdmin) { setState({ status: "ready", solicitudes: [] }); return; }
    // TypeScript no puede afinar "db" dentro de las funciones de abajo
    // (son cierres: no sabe que el guard de arriba sigue valiendo).
    const bd = db;

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
      query(collection(bd, "solicitudesCampana"), where("estado", "==", "Pendiente")),
      (snap) => { pendientes = snap.docs.map(aSolicitud); publicar(); },
      alFallar
    );

    // El orden por fecha necesita el indice compuesto
    // solicitudesCampana(estado, createdAt). Mientras ese indice no
    // exista -- justo despues de desplegar, o si alguien lo borra --
    // Firestore rechaza la consulta con "failed-precondition" y la
    // pantalla quedaria en error.
    //
    // El respaldo quita el orden, que es lo unico que exige el indice:
    // where("estado","in",[...]) + limit() funciona con los indices que
    // Firestore crea solo. Se pierde que sean LAS MAS RECIENTES (llegan
    // 50 cualesquiera), pero la pantalla sigue viva y acotada -- y el
    // orden final lo pone igual publicar(), que ordena por fecha lo que
    // haya llegado. Es el mismo patron que contratosDePaneles.ts.
    const escucharResueltas = (conOrden: boolean) =>
      onSnapshot(
        conOrden
          ? query(
              collection(bd, "solicitudesCampana"),
              where("estado", "in", [...ESTADOS_RESUELTOS]),
              orderBy("createdAt", "desc"),
              limit(RESUELTAS_VISIBLES)
            )
          : query(
              collection(bd, "solicitudesCampana"),
              where("estado", "in", [...ESTADOS_RESUELTOS]),
              limit(RESUELTAS_VISIBLES)
            ),
        (snap) => { resueltas = snap.docs.map(aSolicitud); publicar(); },
        (err) => {
          if (conOrden && esFaltaDeIndice(err)) {
            console.warn(
              "Falta el indice solicitudesCampana(estado, createdAt); " +
                "se muestran 50 solicitudes resueltas sin ordenar por fecha.",
              err
            );
            unsubResueltas = escucharResueltas(false);
            return;
          }
          alFallar(err);
        }
      );

    let unsubResueltas = escucharResueltas(true);

    return () => { unsubPendientes(); unsubResueltas(); };
  }, [isAdmin]);

  return state;
}
