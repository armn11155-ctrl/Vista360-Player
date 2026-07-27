import { useCallback, useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { cloudFunctions } from "../config/firebase";

export interface OcupantePanel {
  clienteId: string;
  clienteNombre: string;
  campana: string;
  fin: string;
  diasRestantes: number;
  monto: number;
}

export interface PanelOcupacion {
  id: string;
  nombre: string;
  ciudad: string;
  estado: string;
  enMantenimiento: boolean;
  impactoDiario: number;
  anunciantesActivos: number;
  anunciantesProgramados: number;
  ingresoActivo: number;
  proximoVencimiento: string | null;
  diasLibre: number | null;
  nuncaContratado: boolean;
  ocupantes: OcupantePanel[];
}

export interface PorVencer {
  panelId: string;
  panelNombre: string;
  ciudad: string;
  clienteId: string;
  clienteNombre: string;
  campana: string;
  fin: string;
  diasRestantes: number;
  monto: number;
}

export interface ResumenOcupacion {
  hoy: string;
  ventanaDias: number;
  totales: {
    paneles: number;
    operativos: number;
    enMantenimiento: number;
    trabajando: number;
    libres: number;
    ocupacionPct: number;
    anunciantesActivos: number;
    ingresoActivo: number;
    seLiberanEnVentana: number;
  };
  paneles: PanelOcupacion[];
  porVencer: PorVencer[];
  libres: PanelOcupacion[];
}

export type OcupacionState =
  | { status: "loading" }
  | { status: "ready"; datos: ResumenOcupacion; recargar: () => void }
  | { status: "error"; message: string; recargar: () => void };

/**
 * Trae el resumen de ocupación del inventario (Cloud Function
 * resumenOcupacion). Es una lectura puntual, no en vivo: cruza los
 * contratos de todos los clientes y no tiene sentido recalcularlo con
 * cada cambio suelto -- hay un botón de recargar para pedirlo de nuevo.
 */
export function useOcupacion(): OcupacionState {
  const [state, setState] = useState<OcupacionState>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  const recargar = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!cloudFunctions) {
      setState({ status: "error", message: "Sin conexión. Intenta de nuevo.", recargar });
      return;
    }
    let cancelado = false;
    setState({ status: "loading" });

    const fn = httpsCallable<Record<string, never>, ResumenOcupacion>(cloudFunctions, "resumenOcupacion");
    fn()
      .then(({ data }) => {
        if (!cancelado) setState({ status: "ready", datos: data, recargar });
      })
      .catch((error: unknown) => {
        if (cancelado) return;
        const raw = error instanceof Error ? error.message : "";
        const limpio = raw.replace("FirebaseError: ", "").replace(/^functions\/[a-z-]+:\s*/i, "").trim();
        setState({
          status: "error",
          // El caso más probable la primera vez es que la función todavía
          // no esté desplegada (el despliegue de Functions es manual).
          message: limpio || "No se pudo cargar. Si acabas de actualizar la app, puede que falte desplegar la función en GitHub Actions.",
          recargar,
        });
      });

    return () => {
      cancelado = true;
    };
  }, [nonce, recargar]);

  return state;
}
