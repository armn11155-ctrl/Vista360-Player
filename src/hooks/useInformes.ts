import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../config/firebase";
import type { InformeCliente } from "../types";

export type InformesState =
  | { status: "loading" }
  | { status: "ready"; informes: InformeCliente[] }
  | { status: "error"; message: string };

export function useInformes(clienteId: string): InformesState {
  const [state, setState] = useState<InformesState>({ status: "loading" });

  useEffect(() => {
    if (!clienteId || !db) return;
    const q = query(
      collection(db, "informesCliente"),
      where("cliente_id", "==", clienteId),
      orderBy("mes", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const informes = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<InformeCliente, "id">) }));
        setState({ status: "ready", informes });
      },
      (err) => setState({ status: "error", message: err.message })
    );
    return unsub;
  }, [clienteId]);

  return state;
}
