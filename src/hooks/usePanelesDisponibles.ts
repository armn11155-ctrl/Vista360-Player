import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import type { Panel } from "../types";

export type PanelesDisponiblesState =
  | { status: "loading" }
  | { status: "ready"; paneles: Panel[] }
  | { status: "error"; message: string };

/** Solo lo usa el admin — lista TODOS los paneles (no solo los de un
 *  contrato específico), para poder elegir uno al crear un contrato
 *  nuevo directo desde el Player.
 *
 *  Ojo: NO se usa orderBy("nombre") en la consulta -- Firestore excluye
 *  en silencio los documentos que no tengan ese campo (paneles viejos
 *  creados desde el sistema Vista360 externo, por ejemplo), y eso hacia
 *  que algunos paneles reales no aparecieran para elegir. Se trae todo
 *  y se ordena del lado del cliente, con nombre vacio como respaldo. */
export function usePanelesDisponibles(isAdmin: boolean): PanelesDisponiblesState {
  const [state, setState] = useState<PanelesDisponiblesState>({ status: "loading" });

  useEffect(() => {
    if (!db || !isAdmin) return;
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
  }, [isAdmin]);

  return state;
}
