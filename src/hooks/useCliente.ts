import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import type { Cliente } from "../types";

export function useCliente(clienteId: string): Cliente | null {
  const [cliente, setCliente] = useState<Cliente | null>(null);

  useEffect(() => {
    if (!clienteId || !db) return;
    const unsub = onSnapshot(doc(db, "clientes", clienteId), (snap) => {
      if (snap.exists()) {
        setCliente({ id: snap.id, ...(snap.data() as Omit<Cliente, "id">) });
      }
    });
    return unsub;
  }, [clienteId]);

  return cliente;
}
