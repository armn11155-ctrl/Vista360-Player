import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../config/firebase";
import type { Panel } from "../types";

export type PanelesDisponiblesState =
  | { status: "loading" }
  | { status: "ready"; paneles: Panel[] }
  | { status: "error"; message: string };

/** Solo lo usa el admin — lista TODOS los paneles (no solo los de un
 *  contrato específico), para poder elegir uno al crear un contrato
 *  nuevo directo desde el Player. */
export function usePanelesDisponibles(isAdmin: boolean): PanelesDisponiblesState {
  const [state, setState] = useState<PanelesDisponiblesState>({ status: "loading" });

  useEffect(() => {
    if (!db || !isAdmin) return;
    const q = query(collection(db, "paneles"), orderBy("nombre", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const paneles = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Panel, "id">) }));
        setState({ status: "ready", paneles });
      },
      (err) => setState({ status: "error", message: err.message })
    );
    return unsub;
  }, [isAdmin]);

  return state;
}
