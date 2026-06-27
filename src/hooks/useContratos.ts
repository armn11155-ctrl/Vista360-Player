import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../config/firebase";
import type { Contrato } from "../types";

export type ContratosState =
  | { status: "loading" }
  | { status: "ready"; contratos: Contrato[] }
  | { status: "error"; message: string };

/**
 * Solo trae los contratos de ESTE cliente (filtrado por cliente_id).
 * Las reglas de Firestore en Vista360 también lo exigen del lado del
 * servidor — esto es además, no en vez de, esa protección.
 */
export function useContratos(clienteId: string): ContratosState {
  const [state, setState] = useState<ContratosState>({ status: "loading" });

  useEffect(() => {
    if (!clienteId || !db) return;
    const q = query(
      collection(db, "contratos"),
      where("cliente_id", "==", clienteId),
      orderBy("inicio", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const contratos = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Contrato, "id">) }))
          .filter((c) => !c.deleted);
        setState({ status: "ready", contratos });
      },
      (err) => setState({ status: "error", message: err.message })
    );
    return unsub;
  }, [clienteId]);

  return state;
}
