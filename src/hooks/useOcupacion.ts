import { useCallback, useEffect, useState } from "react";
import { mensajeDeError } from "../utils/errores";
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
  modalidad: "led" | "lona" | "unipolar";
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

export interface FacturaPendiente {
  id: string;
  numero: string;
  clienteId: string;
  clienteNombre: string;
  estado: string;
  total: number;
  moneda: string;
  vence: string | null;
  diasParaVencer: number | null;
  vencida: boolean;
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
    lonas: number;
    lonasLibres: number;
    ledConEspacio: number;
    unipolares: number;
    unipolaresConEspacio: number;
  };
  paneles: PanelOcupacion[];
  porVencer: PorVencer[];
  libres: PanelOcupacion[];
  cobranza: {
    facturas: FacturaPendiente[];
    total: number;
    vencidas: number;
    totalVencido: number;
  };
}

export type OcupacionState =
  | { status: "loading" }
  | { status: "ready"; datos: ResumenOcupacion; recargar: () => void }
  | { status: "error"; message: string; recargar: () => void };

// El calculo del tablero cruza varias colecciones en el servidor. Repetirlo
// por salir y volver a entrar unos segundos despues era el peor caso posible:
// misma respuesta, misma espera y todas las lecturas otra vez. Dos minutos son
// suficientes para eliminar rebotes; el boton Recargar siempre fuerza una
// consulta real cuando el administrador necesita el dato del instante.
const VIGENCIA_OCUPACION_MS = 120_000;
let cacheOcupacion: { datos: ResumenOcupacion; actualizadoEn: number } | null = null;
let ocupacionEnCurso: Promise<ResumenOcupacion> | null = null;

function pedirOcupacion(forzar: boolean): Promise<ResumenOcupacion> {
  if (!forzar && cacheOcupacion && Date.now() - cacheOcupacion.actualizadoEn < VIGENCIA_OCUPACION_MS) {
    return Promise.resolve(cacheOcupacion.datos);
  }
  if (ocupacionEnCurso) return ocupacionEnCurso;
  if (!cloudFunctions) return Promise.reject(new Error("Sin conexión. Intenta de nuevo."));

  const fn = httpsCallable<Record<string, never>, ResumenOcupacion>(cloudFunctions, "resumenOcupacion");
  ocupacionEnCurso = fn()
    .then(({ data }) => {
      cacheOcupacion = { datos: data, actualizadoEn: Date.now() };
      return data;
    })
    .finally(() => { ocupacionEnCurso = null; });
  return ocupacionEnCurso;
}

/**
 * Trae el resumen de ocupación del inventario (Cloud Function
 * resumenOcupacion). Es una lectura puntual, no en vivo: cruza los
 * contratos de todos los clientes y no tiene sentido recalcularlo con
 * cada cambio suelto -- hay un botón de recargar para pedirlo de nuevo.
 */
export function useOcupacion(): OcupacionState {
  const [nonce, setNonce] = useState(0);
  const recargar = useCallback(() => setNonce((n) => n + 1), []);
  const [state, setState] = useState<OcupacionState>(
    cacheOcupacion
      ? { status: "ready", datos: cacheOcupacion.datos, recargar }
      : { status: "loading" }
  );

  useEffect(() => {
    if (!cloudFunctions) {
      setState({ status: "error", message: "Sin conexión. Intenta de nuevo.", recargar });
      return;
    }
    let cancelado = false;
    const forzar = nonce > 0;
    if (!cacheOcupacion) setState({ status: "loading" });

    pedirOcupacion(forzar)
      .then((data) => {
        if (!cancelado) setState({ status: "ready", datos: data, recargar });
      })
      .catch((error: unknown) => {
        if (cancelado) return;
        setState({
          status: "error",
          // El caso más probable la primera vez es que la función todavía
          // no esté desplegada (el despliegue de Functions es manual).
          message: mensajeDeError(error, "No se pudo cargar. Si acabas de actualizar la app, puede que falte desplegar la función en GitHub Actions."),
          recargar,
        });
      });

    return () => {
      cancelado = true;
    };
  }, [nonce, recargar]);

  return state;
}
