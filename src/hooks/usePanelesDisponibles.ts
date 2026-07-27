import { useCallback, useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../config/firebase";
import type { Panel } from "../types";

export type PanelesDisponiblesState =
  | { status: "loading" }
  | { status: "ready"; paneles: Panel[] }
  | { status: "error"; message: string };

/** El estado, más una forma de volver a pedir la lista. Hace falta porque
 *  ya no hay tiempo real: quien CREA o EDITA paneles (la pantalla de
 *  administración) tiene que poder refrescar después de guardar, o su
 *  propio cambio no aparecería. */
export type PanelesDisponiblesResult = PanelesDisponiblesState & { recargar: () => void };

/** Lista TODOS los paneles (no solo los de un contrato/cliente
 *  específico). La usa el admin para elegir un panel al crear un
 *  contrato nuevo directo desde el Player, y también Cobertura -- ahí
 *  la usan TANTO el admin COMO el cliente, para que en el mapa se vea
 *  todo el inventario de paneles (no solo los que el cliente ya tiene
 *  contratados), y así pueda pedir disponibilidad de un panel nuevo o
 *  renovación del que ya tiene. El parámetro ya no es "isAdmin" -- es
 *  solo un flag para no disparar la consulta hasta tener lo necesario
 *  (ej. esperar a saber si es admin/cliente antes de pedir esto).
 *
 *  Ojo: NO se usa orderBy("nombre") en la consulta -- Firestore excluye
 *  en silencio los documentos que no tengan ese campo (paneles viejos
 *  creados desde el sistema Vista360 externo, por ejemplo), y eso hacia
 *  que algunos paneles reales no aparecieran para elegir. Se trae todo
 *  y se ordena del lado del cliente, con nombre vacio como respaldo. */
export function usePanelesDisponibles(habilitado: boolean): PanelesDisponiblesResult {
  const [state, setState] = useState<PanelesDisponiblesState>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  const recargar = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    // Salir sin fijar estado dejaba el hook en "loading" PARA SIEMPRE:
    // la pantalla se quedaba con el spinner girando en vez de mostrar
    // algo. Cuando no hay nada que consultar, el resultado correcto es
    // "listo y vacío", no "cargando".
    if (!db || !habilitado) { setState({ status: "ready", paneles: [] }); return; }
    // Lectura ÚNICA, no onSnapshot. Antes cada cliente que abría Cobertura
    // dejaba abierta una suscripción en tiempo real a TODO el inventario:
    // una conexión viva consumiendo batería y datos para vigilar algo que
    // no cambia mientras se mira el mapa (el nombre y la ubicación de un
    // panel los edita el admin, no ocurre a mitad de sesión). Con muchos
    // clientes a la vez, eran muchas conexiones abiertas para nada.
    let cancelado = false;
    getDocs(collection(db, "paneles"))
      .then((snap) => {
        if (cancelado) return;
        const paneles = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Panel, "id">) }))
          .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
        setState({ status: "ready", paneles });
      })
      .catch((err: unknown) => {
        if (cancelado) return;
        setState({ status: "error", message: err instanceof Error ? err.message : "No se pudieron cargar los paneles." });
      });
    return () => { cancelado = true; };
  }, [habilitado, nonce]);

  return { ...state, recargar };
}
