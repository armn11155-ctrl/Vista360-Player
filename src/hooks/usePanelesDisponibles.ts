import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import type { Panel } from "../types";

export type PanelesDisponiblesState =
  | { status: "loading" }
  | { status: "ready"; paneles: Panel[] }
  | { status: "error"; message: string };

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
export function usePanelesDisponibles(habilitado: boolean): PanelesDisponiblesState {
  const [state, setState] = useState<PanelesDisponiblesState>({ status: "loading" });

  useEffect(() => {
    // Salir sin fijar estado dejaba el hook en "loading" PARA SIEMPRE:
    // la pantalla se quedaba con el spinner girando en vez de mostrar
    // algo. Cuando no hay nada que consultar, el resultado correcto es
    // "listo y vacío", no "cargando".
    if (!db || !habilitado) { setState({ status: "ready", paneles: [] }); return; }
    const q = collection(db, "paneles");
    const unsub = onSnapshot(
      q,
      (snap) => {
        const paneles = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Panel, "id">) }))
          .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
        setState({ status: "ready", paneles });
      },
      (err) => setState({ status: "error", message: err.message })
    );
    return unsub;
  }, [habilitado]);

  return state;
}
