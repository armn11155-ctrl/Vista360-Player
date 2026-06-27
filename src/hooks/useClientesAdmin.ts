import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../config/firebase";
import type { Cliente } from "../types";

export type ClientesAdminState =
  | { status: "loading" }
  | { status: "ready"; clientes: Cliente[] }
  | { status: "error"; message: string };

/** Solo lo usa la cuenta admin, para el selector "ver como cuál cliente". */
export function useClientesAdmin(): ClientesAdminState {
  const [state, setState] = useState<ClientesAdminState>({ status: "loading" });

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "clientes"), orderBy("empresa", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const clientes = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Cliente, "id">) }));
        setState({ status: "ready", clientes });
      },
      (err) => setState({ status: "error", message: err.message })
    );
    return unsub;
  }, []);

  return state;
}
