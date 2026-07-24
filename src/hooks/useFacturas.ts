import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, type FirestoreError } from "firebase/firestore";
import { db } from "../config/firebase";
import type { Factura } from "../types";

export type FacturasState =
  | { status: "loading" }
  | { status: "ready"; facturas: Factura[] }
  | { status: "error"; message: string };

/**
 * Facturas se identifican principalmente por RUC (cliente_doc) --
 * vienen de facturacion-web, un sistema distinto que comparte el mismo
 * Firebase. Pero un cliente sin RUC registrado tambien puede tener
 * facturas: las que el admin sube directo desde Vista360 Player,
 * guardadas con cliente_id en vez de cliente_doc. Por eso este hook
 * escucha ambas colecciones (por ruc y por clienteId) y las combina.
 */

/** "permission-denied" en CUALQUIERA de las dos consultas se trata
 *  como "esta consulta no tiene nada para mostrar", no como un error
 *  duro -- un cliente viendo SU PROPIA pantalla de Facturas nunca
 *  deberia toparse con un mensaje tecnico de permisos (eso es ruido
 *  de configuracion del lado de las reglas de Firestore, no algo que
 *  el cliente pueda hacer algo al respecto). La otra consulta puede
 *  seguir funcionando bien -- por ejemplo, un cliente sin RUC nunca
 *  iba a tener resultados por RUC de todos modos. Solo un error que
 *  NO sea de permisos (ej. sin conexion) sigue mostrandose como error
 *  real, para no esconder un problema genuino de red para siempre. */
function esPermisoDenegado(err: FirestoreError): boolean {
  return err.code === "permission-denied";
}

export function useFacturas(ruc: string | undefined, clienteId?: string): FacturasState {
  const [porRuc, setPorRuc] = useState<Factura[] | null>(null);
  const [porCliente, setPorCliente] = useState<Factura[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPorRuc(null);
    if (!db || !ruc) {
      setPorRuc([]);
      return;
    }
    const q = query(collection(db, "facturas"), where("cliente_doc", "==", ruc));
    const unsub = onSnapshot(
      q,
      (snap) => {
        // Limpiar un error viejo si esta consulta ahora si funciona --
        // antes "error" solo se ENCENDIA (nunca se apagaba), asi que un
        // hipo pasajero de red dejaba la pantalla de Facturas mostrando
        // el error PARA SIEMPRE, aunque el listener se reconecte solo y
        // vuelva a traer datos buenos despues.
        setError(null);
        setPorRuc(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Factura, "id">) })));
      },
      (err) => (esPermisoDenegado(err) ? setPorRuc([]) : setError(err.message))
    );
    return unsub;
  }, [ruc]);

  useEffect(() => {
    setPorCliente(null);
    if (!db || !clienteId) {
      setPorCliente([]);
      return;
    }
    const q = query(collection(db, "facturas"), where("cliente_id", "==", clienteId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setError(null);
        setPorCliente(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Factura, "id">) })));
      },
      (err) => (esPermisoDenegado(err) ? setPorCliente([]) : setError(err.message))
    );
    return unsub;
  }, [clienteId]);

  if (error) return { status: "error", message: error };
  if (porRuc === null || porCliente === null) return { status: "loading" };

  const vistos = new Set<string>();
  const facturas: Factura[] = [];
  for (const f of [...porRuc, ...porCliente]) {
    if (vistos.has(f.id)) continue;
    vistos.add(f.id);
    facturas.push(f);
  }
  facturas.sort((a, b) => (b.numero ?? 0) - (a.numero ?? 0));

  return { status: "ready", facturas };
}
