import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { cloudFunctions } from "../config/firebase";

export interface UltimoInformeResumen {
  id: string;
  mes: string;
  dia?: string;
  mesLabel: string;
  createdAt: string;
}

interface ResumenInformes {
  ultimoInforme: UltimoInformeResumen | null;
  reporteEsteMesListo: boolean;
}

export type ResumenInformesState =
  | { status: "loading" }
  | ({ status: "ready" } & ResumenInformes)
  | { status: "error"; message: string };

type Respuesta = { ok: boolean; resumen: ResumenInformes };

const VIGENCIA_RESUMEN_MS = 60_000;
const CACHE = new Map<string, { resumen: ResumenInformes; actualizadoEn: number }>();
const PETICIONES = new Map<string, Promise<ResumenInformes>>();

export function invalidarResumenInformes(clienteId: string): void {
  CACHE.delete(clienteId);
}

function cargarResumen(clienteId: string, mesActual: string): Promise<ResumenInformes> {
  const cacheado = CACHE.get(clienteId);
  if (cacheado && Date.now() - cacheado.actualizadoEn < VIGENCIA_RESUMEN_MS) {
    return Promise.resolve(cacheado.resumen);
  }
  const existente = PETICIONES.get(clienteId);
  if (existente) return existente;
  if (!cloudFunctions) return Promise.resolve({ ultimoInforme: null, reporteEsteMesListo: false });

  const listarReportesCliente = httpsCallable<
    { clienteId: string; resumen: true; mesActual: string },
    Respuesta
  >(cloudFunctions, "listarReportesCliente");
  const peticion = listarReportesCliente({ clienteId, resumen: true, mesActual })
    .then((respuesta) => {
      CACHE.set(clienteId, { resumen: respuesta.data.resumen, actualizadoEn: Date.now() });
      return respuesta.data.resumen;
    })
    .finally(() => PETICIONES.delete(clienteId));
  PETICIONES.set(clienteId, peticion);
  return peticion;
}

/**
 * Resumen liviano para Inicio. No pide PDFs, URLs firmadas ni documentos
 * informesCliente; el listado completo queda reservado para Reportes.
 */
export function useResumenInformes(clienteId: string, mesActual: string): ResumenInformesState {
  const cacheado = CACHE.get(clienteId)?.resumen;
  const [state, setState] = useState<ResumenInformesState>(
    cacheado ? { status: "ready", ...cacheado } : { status: "loading" }
  );

  useEffect(() => {
    const resumenCacheado = CACHE.get(clienteId)?.resumen;
    setState(resumenCacheado ? { status: "ready", ...resumenCacheado } : { status: "loading" });
    if (!clienteId || !cloudFunctions) {
      setState({ status: "ready", ultimoInforme: null, reporteEsteMesListo: false });
      return;
    }

    let cancelado = false;
    cargarResumen(clienteId, mesActual)
      .then((resumen) => {
        if (!cancelado) setState({ status: "ready", ...resumen });
      })
      .catch((error) => {
        if (cancelado) return;
        const anterior = CACHE.get(clienteId)?.resumen;
        if (anterior) {
          setState({ status: "ready", ...anterior });
          return;
        }
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "No se pudo cargar el resumen de reportes.",
        });
      });
    return () => { cancelado = true; };
  }, [clienteId, mesActual]);

  return state;
}
