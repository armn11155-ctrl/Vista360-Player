import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import type { Cliente } from "../types";
import { clientesAdminEnMemoria } from "./useClientesAdmin";

function clienteEnMemoria(clienteId: string): Cliente | null {
  return clientesAdminEnMemoria()?.find((cliente) => cliente.id === clienteId) ?? null;
}

export function useCliente(clienteId: string): Cliente | null {
  // El selector del personal interno ya leyó la ficha básica. Usarla en el
  // primer render evita que nombre/logo desaparezcan mientras la escucha del
  // documento confirma la versión actual. No sustituye la validación en vivo.
  const [cliente, setCliente] = useState<Cliente | null>(() => clienteEnMemoria(clienteId));

  useEffect(() => {
    // Limpiar al cambiar de cliente. Sin esto, el admin que salta de un
    // cliente a otro seguía viendo los datos del ANTERIOR (nombre,
    // logo, RUC) hasta que llegara la primera respuesta del nuevo --
    // y si el documento no existía, se quedaba con los del anterior
    // indefinidamente, mostrando datos de un cliente equivocado.
    setCliente(clienteEnMemoria(clienteId));
    if (!clienteId || !db) return;
    const unsub = onSnapshot(
      doc(db, "clientes", clienteId),
      (snap) => {
        setCliente(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Cliente, "id">) } : null);
      },
      (error) => {
        console.error("No se pudo cargar el cliente.", error);
        setCliente(null);
      }
    );
    return unsub;
  }, [clienteId]);

  return cliente;
}
