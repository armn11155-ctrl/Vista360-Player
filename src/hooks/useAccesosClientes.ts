import { useEffect, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../config/firebase";

export interface VisitaPantalla {
  count: number;
  lastVisit: number | null;
}

export interface AccesoCliente {
  clienteId: string;
  empresa: string;
  lastLogin: number | null;
  lastLoginCount: number;
  pantallasVisitadas: Record<string, VisitaPantalla>;
}

export type AccesosState =
  | { status: "loading" }
  | { status: "ready"; accesos: AccesoCliente[] }
  | { status: "error"; message: string };

/** Solo la usa la cuenta admin — ver pantalla AnaliticaClientes. */
export function useAccesosClientes(isAdmin: boolean): AccesosState {
  const [state, setState] = useState<AccesosState>({ status: "loading" });

  useEffect(() => {
    if (!isAdmin || !app) return;
    let cancelled = false;
    const functions = getFunctions(app);
    const listar = httpsCallable<void, { accesos: AccesoCliente[] }>(
      functions,
      "listarAccesosClientes"
    );
    listar()
      .then((res) => {
        if (!cancelled) setState({ status: "ready", accesos: res.data.accesos });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "No se pudo cargar la analítica.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  return state;
}
