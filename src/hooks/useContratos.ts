import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../config/firebase";
import { hoyEnPeru } from "../utils/fechas";
import type { Contrato } from "../types";

export type ContratosState =
  | { status: "loading" }
  | { status: "ready"; contratos: Contrato[] }
  | { status: "error"; message: string; retry: () => void };

/**
 * Contratos de ESTE cliente (filtrado por cliente_id). Las reglas de
 * Firestore también lo exigen del lado del servidor — esto es además, no
 * en vez de, esa protección.
 *
 * POR DEFECTO SOLO TRAE LO VIGENTE (fin >= hoy): las campañas activas y
 * las programadas. El historial cerrado NO se lee.
 *
 * POR QUÉ. Este hook se ejecuta en CADA sesión, y antes traía todas las
 * campañas que el cliente hubiera tenido nunca. Un cliente de diez años
 * pagaba cuarenta documentos cada vez que abría la aplicación, para
 * mostrar dos campañas activas. Era el último gasto que crecía con la
 * antigüedad del cliente.
 *
 * Y quien lo necesitaba, no lo necesitaba. Se revisó uno por uno:
 *  - Cobertura DESCARTA las finalizadas en tres sitios distintos, y el
 *    "libre desde" del panel viene del propio panel, no del contrato.
 *  - Las notificaciones solo avisan de vencimientos en 30 días.
 *  - Facturas las usa para elegir a qué campaña asociar una factura
 *    nueva, que siempre es una vigente.
 *
 * El ÚNICO sitio que sí quiere el historial es Mis campañas, con sus
 * pestañas "Finalizadas" y "Todas". Ese carga el historial aparte y solo
 * cuando la persona lo pide (ver useContratosHistoricos). La mayoría de
 * las sesiones nunca pulsan esa pestaña, así que la mayoría no lo paga.
 *
 * NO LLEVA orderBy. Firestore exige que el primer orden sea el campo de
 * la desigualdad, y ordenar por "fin" no es lo que quiere la pantalla.
 * Con el filtro puesto son unos pocos documentos: ordenarlos en el
 * navegador es gratis y no ata la consulta a un índice de más.
 */
export function useContratos(clienteId: string): ContratosState {
  return useConsultaDeContratos(clienteId, true);
}

/**
 * El historial COMPLETO, incluidas las campañas ya terminadas.
 *
 * Solo debe activarse bajo demanda -- es la consulta cara, la que crece
 * con los años. `activo` en false no consulta nada y devuelve vacío.
 */
export function useContratosHistoricos(clienteId: string, activo: boolean): ContratosState {
  return useConsultaDeContratos(activo ? clienteId : "", false);
}

function useConsultaDeContratos(clienteId: string, soloVigentes: boolean): ContratosState {
  const [state, setState] = useState<ContratosState>({ status: "loading" });
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    // Salir sin fijar estado dejaba el hook en "loading" PARA SIEMPRE:
    // la pantalla se quedaba con el spinner girando en vez de mostrar
    // algo. Cuando no hay nada que consultar, el resultado correcto es
    // "listo y vacío", no "cargando".
    if (!clienteId || !db) { setState({ status: "ready", contratos: [] }); return; }
    setState({ status: "loading" });
    const bd = db;
    const consulta = (conFiltroDeFecha: boolean) =>
      conFiltroDeFecha
        ? query(
            collection(bd, "contratos"),
            where("cliente_id", "==", clienteId),
            where("fin", ">=", hoyEnPeru())
          )
        : query(collection(bd, "contratos"), where("cliente_id", "==", clienteId));

    // RESPALDO SI FALTA EL INDICE contratos(cliente_id, fin).
    //
    // Sin el, Firestore rechaza la consulta con failed-precondition y el
    // cliente se queda SIN NINGUNA campana -- la pantalla principal
    // vacia. Y la ventana existe de verdad: Cloudflare publica el
    // frontend en cuanto se empuja, pero el indice solo se crea al
    // lanzar el despliegue.
    //
    // El respaldo lee todo el historial: mas caro, exactamente lo que
    // haciamos antes, pero CORRECTO. Vale mas pagar de mas unos minutos
    // que ensenar una lista vacia.
    let escuchando: (() => void) | null = null;
    const escuchar = (conFiltroDeFecha: boolean) => onSnapshot(
      consulta(conFiltroDeFecha),
      (snap) => {
        const contratos = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Contrato, "id">) }))
          .filter((c) => !c.deleted)
          // Lo ordenaba Firestore con orderBy("inicio","desc"); ahora se
          // hace acá por lo explicado arriba. Mismo resultado.
          .sort((a, b) => String(b.inicio ?? "").localeCompare(String(a.inicio ?? "")));
        setState({ status: "ready", contratos });
      },
      (err) => {
        // Solo failed-precondition significa "falta el indice". Un fallo
        // de permisos o de red debe verse como error, no disfrazarse de
        // consulta cara. Y la guarda `conFiltroDeFecha &&` impide que el
        // respaldo se reintente a si mismo en bucle.
        if (conFiltroDeFecha && (err as { code?: string }).code === "failed-precondition") {
          console.warn(
            "Falta el indice contratos(cliente_id, fin); se lee el historial completo " +
              "hasta que el indice termine de construirse.",
            err
          );
          escuchando = escuchar(false);
          return;
        }
        setState({
          status: "error",
          message: err.message,
          retry: () => setRetryNonce((n) => n + 1),
        });
      }
    );

    escuchando = escuchar(soloVigentes);
    return () => { escuchando?.(); };
  }, [clienteId, soloVigentes, retryNonce]);

  return state;
}
