import { useCallback, useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { mensajeDeError } from "../utils/errores";
import type { Panel } from "../types";

export type PanelesDisponiblesState =
  | { status: "loading" }
  | { status: "ready"; paneles: Panel[] }
  | { status: "error"; message: string };

/** Se conserva `recargar` aunque con tiempo real los cambios lleguen
 *  solos: sirve para reintentar a mano si la escucha falló (por ejemplo,
 *  tras quedarse sin señal). */
export type PanelesDisponiblesResult = PanelesDisponiblesState & { recargar: () => void };

/** Lista TODOS los paneles (no solo los de un contrato/cliente
 *  específico). La usa el admin para elegir un panel al crear un
 *  contrato nuevo directo desde el Player, y también Cobertura -- ahí
 *  la usan TANTO el admin COMO el cliente, para que en el mapa se vea
 *  todo el inventario de paneles (no solo los que el cliente ya tiene
 *  contratados), y así pueda pedir disponibilidad de un panel nuevo o
 *  renovación del que ya tiene. El parámetro ya no es "isAdmin" -- es
 *  solo un flag para no disparar la consulta hasta tener lo necesario
 *  (ej. esperar a saber si es admin/cliente antes de pedir esto).
 *
 *  Ojo: NO se usa orderBy("nombre") en la consulta -- Firestore excluye
 *  en silencio los documentos que no tengan ese campo (paneles viejos
 *  creados desde el sistema Vista360 externo, por ejemplo), y eso hacia
 *  que algunos paneles reales no aparecieran para elegir. Se trae todo
 *  y se ordena del lado del cliente, con nombre vacio como respaldo. */
export function usePanelesDisponibles(habilitado: boolean): PanelesDisponiblesResult {
  const [state, setState] = useState<PanelesDisponiblesState>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  const recargar = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    // Salir sin fijar estado dejaba el hook en "loading" PARA SIEMPRE:
    // la pantalla se quedaba con el spinner girando en vez de mostrar
    // algo. Cuando no hay nada que consultar, el resultado correcto es
    // "listo y vacío", no "cargando".
    if (!db || !habilitado) { setState({ status: "ready", paneles: [] }); return; }
    // En TIEMPO REAL a propósito. Se probó con una lectura única para
    // ahorrar conexiones, pero a esta escala no compensa: el inventario
    // son decenas de soportes físicos, no miles, así que la escucha
    // cuesta prácticamente nada -- y a cambio el mapa siempre está
    // correcto.
    //
    // Y el estado de un panel SÍ cambia solo mientras alguien mira:
    // crearContrato lo marca "Ocupado", eliminarContrato lo libera, y la
    // tarea diaria sincronizarEstadoPaneles ajusta estado y libreDesde.
    // Con lectura única, quien tuviera Cobertura abierta no vería nada de
    // eso hasta salir y volver a entrar.
    //
    // Esto empezaría a pesar recién con cientos de paneles o muchos
    // clientes mirando el mapa a la vez; ahí convendría volver a lectura
    // única con caché.
    const unsub = onSnapshot(
      collection(db, "paneles"),
      (snap) => {
        const paneles = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Panel, "id">) }))
          .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
        setState({ status: "ready", paneles });
      },
      (err) => setState({ status: "error", message: mensajeDeError(err, "No se pudieron cargar los paneles.") })
    );
    return unsub;
  }, [habilitado, nonce]);

  return { ...state, recargar };
}
