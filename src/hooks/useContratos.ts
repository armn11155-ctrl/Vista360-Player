import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../config/firebase";
import { hoyEnPeru } from "../utils/fechas";
import type { Contrato, SolicitudCampana } from "../types";

export type ContratosState =
  | { status: "loading" }
  | { status: "ready"; contratos: Contrato[] }
  | { status: "error"; message: string; retry: () => void };

export type SolicitudesDelClienteState =
  | { status: "loading" }
  | { status: "ready"; solicitudes: SolicitudCampana[] }
  | { status: "error"; message: string };

/** Lo que hay dentro del documento resumen del cliente. */
interface Resumen {
  contratos: Contrato[];
  solicitudes: SolicitudCampana[];
}

type ResumenState =
  | { status: "loading" }
  | { status: "ready"; datos: Resumen }
  | { status: "error"; message: string; retry: () => void };

/**
 * Campañas del cliente, desde SU documento resumen.
 *
 * POR QUÉ. Este hook corre en cada sesión. Antes costaba una lectura por
 * campaña; ahora cuesta 1, tenga el cliente dos campañas o doscientas.
 *
 * EL RESUMEN GUARDA TODAS LAS CAMPAÑAS, no solo las vigentes, y el
 * filtro por fecha se hace acá. Es deliberado: "vigente" depende del día
 * de hoy, así que un resumen de "vigentes" mostraría como activa una
 * campaña terminada anoche. Guardando todo, el documento no depende de
 * la fecha y solo cambia cuando alguien escribe -- que es lo que sí
 * sabemos controlar (los contratos solo se escriben desde Cloud
 * Functions, y cada una regenera el resumen).
 *
 * Efecto secundario bueno: el historial completo ya viene en el mismo
 * documento, así que la pestaña "Finalizadas" pasa a costar CERO.
 *
 * UNA SOLA ESCUCHA POR CLIENTE, compartida entre todos los componentes
 * que la piden (App y Mis campañas). Dos onSnapshot sobre el mismo
 * documento serían dos lecturas.
 */

interface Suscriptor { (estado: ResumenState): void }

let clienteActual = "";
let estadoActual: ResumenState = { status: "loading" };
let suscriptores = new Set<Suscriptor>();
let cortar: (() => void) | null = null;

function publicar(estado: ResumenState) {
  estadoActual = estado;
  suscriptores.forEach((s) => s(estado));
}

function arrancar(clienteId: string) {
  if (!db) { publicar({ status: "ready", datos: { contratos: [], solicitudes: [] } }); return; }
  const bd = db;
  const reintentar = () => { detener(); arrancar(clienteId); };

  const desdeDocumentos = (docs: Array<{ id: string; data: () => unknown }>) =>
    docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Contrato, "id">) }))
      .filter((c) => !c.deleted);

  // Respaldo: la consulta de siempre, contra la colección. Más cara,
  // pero correcta. Se usa si el resumen no existe todavía o si las
  // reglas aún no permiten leerlo.
  const leerColeccionDirecta = () => {
    // Dos consultas, como antes de existir el resumen. Se publican
    // juntas para que la pantalla no parpadee a medias.
    let contratos: Contrato[] | null = null;
    let solicitudes: SolicitudCampana[] | null = null;
    const juntar = () => {
      if (contratos === null || solicitudes === null) return;
      publicar({ status: "ready", datos: { contratos: ordenar(contratos), solicitudes } });
    };
    const alFallar = (err: { message: string }) =>
      publicar({ status: "error", message: err.message, retry: reintentar });
    const a = onSnapshot(
      query(collection(bd, "contratos"), where("cliente_id", "==", clienteId)),
      (snap) => { contratos = desdeDocumentos(snap.docs) as Contrato[]; juntar(); },
      alFallar
    );
    const b = onSnapshot(
      query(collection(bd, "solicitudesCampana"), where("cliente_id", "==", clienteId)),
      (snap) => {
        solicitudes = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SolicitudCampana, "id">) }));
        juntar();
      },
      alFallar
    );
    cortar = () => { a(); b(); };
  };

  cortar = onSnapshot(
    doc(bd, `agregados/cliente-${clienteId}`),
    (snap) => {
      const datos = snap.data() as { contratos?: Contrato[]; solicitudes?: SolicitudCampana[] } | undefined;
      if (!snap.exists() || !Array.isArray(datos?.contratos)) {
        console.warn(
          "No existe el resumen de este cliente; se leen las campañas de la colección. " +
            "Lanza el barrido diario para generarlo."
        );
        leerColeccionDirecta();
        return;
      }
      publicar({
        status: "ready",
        datos: {
          contratos: ordenar(datos!.contratos!.filter((c) => !c.deleted)),
          solicitudes: Array.isArray(datos!.solicitudes) ? datos!.solicitudes! : [],
        },
      });
    },
    (err) => {
      console.warn(
        "No se pudo leer el resumen del cliente; se leen las campañas de la colección. " +
          "Revisa que las reglas permitan leer agregados/cliente-<id>.",
        err
      );
      leerColeccionDirecta();
    }
  );
}

function ordenar(contratos: Contrato[]): Contrato[] {
  return [...contratos].sort((a, b) =>
    String(b.inicio ?? "").localeCompare(String(a.inicio ?? ""))
  );
}

function detener() {
  cortar?.();
  cortar = null;
}

function suscribir(clienteId: string, fn: Suscriptor): () => void {
  if (clienteId !== clienteActual) {
    detener();
    clienteActual = clienteId;
    estadoActual = { status: "loading" };
    if (clienteId) arrancar(clienteId);
    else estadoActual = { status: "ready", datos: { contratos: [], solicitudes: [] } };
  }
  suscriptores.add(fn);
  fn(estadoActual);
  return () => {
    suscriptores.delete(fn);
    // Al quedarse sin nadie escuchando se corta: si no, cambiar de
    // cliente en modo administrador dejaría escuchas vivas de todos los
    // clientes visitados, cobrando cada cambio de cada uno.
    if (suscriptores.size === 0) { detener(); clienteActual = ""; }
  };
}

function useResumen(clienteId: string): ResumenState {
  const [state, setState] = useState<ResumenState>({ status: "loading" });
  useEffect(() => {
    if (!clienteId) { setState({ status: "ready", datos: { contratos: [], solicitudes: [] } }); return; }
    return suscribir(clienteId, setState);
  }, [clienteId]);
  return state;
}

/** Las campañas VIGENTES (activas y programadas). Es lo que usa toda la
 *  aplicación salvo la pestaña de historial. */
export function useContratos(clienteId: string): ContratosState {
  const state = useResumen(clienteId);
  if (state.status !== "ready") return state;
  const hoy = hoyEnPeru();
  return {
    status: "ready",
    contratos: state.datos.contratos.filter((c) => String(c.fin ?? "") >= hoy),
  };
}

/**
 * El historial COMPLETO, incluidas las terminadas.
 *
 * Ya no cuesta ninguna lectura extra: sale del mismo documento que
 * useContratos, que la sesión ya pagó. `activo` se mantiene en la firma
 * para no cambiar quien lo llama, pero solo decide si se devuelve.
 */
export function useContratosHistoricos(clienteId: string, activo: boolean): ContratosState {
  const state = useResumen(activo ? clienteId : "");
  if (state.status !== "ready") return state;
  return { status: "ready", contratos: state.datos.contratos };
}

/**
 * Las solicitudes del cliente, del MISMO documento.
 *
 * No cuesta ninguna lectura extra: la sesión ya pagó ese documento para
 * las campañas. Antes eran dos consultas más (pendientes y resueltas
 * recientes), y con ellas la sesión costaba 5 lecturas en vez de 4.
 */
export function useSolicitudesDelCliente(clienteId: string): SolicitudesDelClienteState {
  const state = useResumen(clienteId);
  if (state.status === "loading") return state;
  if (state.status === "error") return { status: "error", message: state.message };
  return { status: "ready", solicitudes: state.datos.solicitudes };
}
