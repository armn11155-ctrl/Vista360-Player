import { useCallback, useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { cloudFunctions } from "../config/firebase";
import type { InformeCliente } from "../types";
import { invalidarResumenInformes } from "./useResumenInformes";

export type InformesState =
  | { status: "loading" }
  | { status: "ready"; informes: InformeCliente[] }
  | { status: "error"; message: string };

export type UseInformesResult = InformesState & { recargar: () => void };

type ListarReportesResponse = { ok: boolean; informes: InformeCliente[] };

// Cachea el ÚLTIMO listado bueno por cliente, en memoria (se pierde al
// recargar la página, a propósito -- las URLs firmadas que trae cada
// informe viven 6h, no hace falta persistirlo en localStorage como
// useSignedUrls). Se pidió que Reportes sea más rápido: antes, CADA
// vez que la pantalla se abría (es lazy -- se desmonta al salir, se
// vuelve a montar de cero al volver a entrar) tocaba esperar de nuevo
// a la Cloud Function (que lista objetos en R2 y firma URLs, nada
// instantáneo, y peor si tuvo que "despertar" por inactividad) antes
// de mostrar CUALQUIER cosa -- la lista ya se había visto hacía 10
// segundos y aun así había que ver el loader de nuevo. Ahora, si ya
// hay un listado en caché para ese cliente, se muestra DE UNA (sin
// loader) mientras por detrás se pide el listado fresco igual y se
// reemplaza en cuanto llega -- "stale-while-revalidate": lo último
// visto se ve al toque, y si cambió algo (reporte nuevo, por ejemplo)
// se actualiza solo, sin que la persona tenga que esperar mirando un
// loader para eso.
const VIGENCIA_LISTADO_MS = 60_000;
const CACHE = new Map<string, { informes: InformeCliente[]; actualizadoEn: number }>();
const PETICIONES = new Map<string, Promise<InformeCliente[]>>();

function listar(clienteId: string, forzar: boolean): Promise<InformeCliente[]> {
  const cacheado = CACHE.get(clienteId);
  if (!forzar && cacheado && Date.now() - cacheado.actualizadoEn < VIGENCIA_LISTADO_MS) {
    return Promise.resolve(cacheado.informes);
  }
  const existente = PETICIONES.get(clienteId);
  if (existente) return existente;
  if (!cloudFunctions) return Promise.resolve([]);

  const listarReportesCliente = httpsCallable<{ clienteId: string }, ListarReportesResponse>(
    cloudFunctions,
    "listarReportesCliente"
  );
  const peticion = listarReportesCliente({ clienteId })
    .then((res) => {
      CACHE.set(clienteId, { informes: res.data.informes, actualizadoEn: Date.now() });
      return res.data.informes;
    })
    .finally(() => PETICIONES.delete(clienteId));
  PETICIONES.set(clienteId, peticion);
  return peticion;
}

/**
 * La lista de reportes sale directo de R2 (Cloud Function
 * listarReportesCliente), no de Firestore: los PDFs ya viven ahí con
 * una key predecible por cliente/mes, así que no hace falta mantener
 * un catálogo aparte ni gastar lecturas de Firestore para mostrarlos.
 * No es en tiempo real (no hay onSnapshot) — por eso generarReporte()
 * en Reportes.tsx llama a recargar() después de generar un PDF nuevo.
 */
export function useInformes(clienteId: string): UseInformesResult {
  const cacheado = CACHE.get(clienteId);
  const [state, setState] = useState<InformesState>(
    cacheado ? { status: "ready", informes: cacheado.informes } : { status: "loading" }
  );

  const recargar = useCallback(() => {
    if (!clienteId || !cloudFunctions) {
      setState({ status: "ready", informes: [] });
      return;
    }
    invalidarResumenInformes(clienteId);
    // Si no hay nada en caché todavía, sí hay que mostrar el loader --
    // no hay nada mejor que ofrecer mientras se espera la primera vez.
    if (!CACHE.has(clienteId)) {
      setState({ status: "loading" });
    }
    listar(clienteId, true)
      .then((informes) => {
        setState({ status: "ready", informes });
      })
      .catch((err) => {
        // Si falla el refresco pero YA había algo en caché, se deja
        // el listado viejo en pantalla en vez de taparlo con un error
        // -- sigue siendo mejor información desactualizada que nada.
        if (CACHE.has(clienteId)) return;
        setState({ status: "error", message: err instanceof Error ? err.message : "Error desconocido" });
      });
  }, [clienteId]);

  useEffect(() => {
    // Seed inmediato si cambia de cliente y ya hay algo en caché para
    // el nuevo -- evita el "loading" al alternar entre clientes que ya
    // se visitaron (el admin, sobre todo).
    const c = CACHE.get(clienteId);
    setState(c ? { status: "ready", informes: c.informes } : { status: "loading" });
    if (!clienteId || !cloudFunctions) {
      setState({ status: "ready", informes: [] });
      return;
    }
    let cancelado = false;
    listar(clienteId, false)
      .then((informes) => {
        if (!cancelado) setState({ status: "ready", informes });
      })
      .catch((err) => {
        if (!cancelado && !CACHE.has(clienteId)) {
          setState({ status: "error", message: err instanceof Error ? err.message : "Error desconocido" });
        }
      });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  return { ...state, recargar };
}
