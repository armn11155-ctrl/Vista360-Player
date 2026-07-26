import { useEffect, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../config/firebase";
import type { Contrato } from "../types";

export type ContratosAdminState =
  | { status: "loading" }
  | { status: "ready"; contratos: Contrato[] }
  | { status: "error"; message: string };

/**
 * TODOS los contratos de TODOS los clientes, sin filtrar por
 * cliente_id -- solo para uso del admin (calendario general de
 * campañas). Mismo patrón que useClientesAdmin.ts / useSolicitudesCampana.ts:
 * una lectura sin filtro, permitida para la cuenta admin.
 */
export function useContratosAdmin(isAdmin: boolean): ContratosAdminState {
  const [state, setState] = useState<ContratosAdminState>({ status: "loading" });

  useEffect(() => {
    if (!db || !isAdmin) return;
    const q = query(collection(db, "contratos"));
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
  }, [isAdmin]);

  return state;
}
