import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../config/firebase";
import type { Factura } from "../types";

export type FacturasState =
  | { status: "loading" }
  | { status: "ready"; facturas: Factura[] }
  | { status: "error"; message: string };

/** Facturas se identifican por RUC (cliente_doc), no por cliente_id —
 *  vienen de facturacion-web, un sistema distinto que comparte el mismo
 *  Firebase. Por eso este hook necesita el RUC del cliente, no su id. */
export function useFacturas(ruc: string | undefined): FacturasState {
  const [state, setState] = useState<FacturasState>({ status: "loading" });

  useEffect(() => {
    if (!db || !ruc) {
      setState({ status: "ready", facturas: [] });
      return;
    }
    const q = query(collection(db, "facturas"), where("cliente_doc", "==", ruc));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const facturas = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Factura, "id">) }))
          .sort((a, b) => (b.numero ?? 0) - (a.numero ?? 0));
        setState({ status: "ready", facturas });
      },
      (err) => setState({ status: "error", message: err.message })
    );
    return unsub;
  }, [ruc]);

  return state;
}
