import { useCallback, useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { cloudFunctions } from "../config/firebase";
import type { InformeCliente } from "../types";

export type InformesState =
  | { status: "loading" }
  | { status: "ready"; informes: InformeCliente[] }
  | { status: "error"; message: string };

export type UseInformesResult = InformesState & { recargar: () => void };

type ListarReportesResponse = { ok: boolean; informes: InformeCliente[] };

/**
 * La lista de reportes sale directo de R2 (Cloud Function
 * listarReportesCliente), no de Firestore: los PDFs ya viven ahí con
 * una key predecible por cliente/mes, así que no hace falta mantener
 * un catálogo aparte ni gastar lecturas de Firestore para mostrarlos.
 * No es en tiempo real (no hay onSnapshot) — por eso generarReporte()
 * en Reportes.tsx llama a recargar() después de generar un PDF nuevo.
 */
export function useInformes(clienteId: string): UseInformesResult {
  const [state, setState] = useState<InformesState>({ status: "loading" });

  const recargar = useCallback(() => {
    if (!clienteId || !cloudFunctions) {
      setState({ status: "ready", informes: [] });
      return;
    }
    setState({ status: "loading" });
    const listarReportesCliente = httpsCallable<{ clienteId: string }, ListarReportesResponse>(
      cloudFunctions,
      "listarReportesCliente"
    );
    listarReportesCliente({ clienteId })
      .then((res) => setState({ status: "ready", informes: res.data.informes }))
      .catch((err) =>
        setState({ status: "error", message: err instanceof Error ? err.message : "Error desconocido" })
      );
  }, [clienteId]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return { ...state, recargar };
}
