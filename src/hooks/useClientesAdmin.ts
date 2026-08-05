import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../config/firebase";
import type { Cliente } from "../types";

export type ClientesAdminState =
  | { status: "loading" }
  | { status: "ready"; clientes: Cliente[] }
  | { status: "error"; message: string };

/** Campañas activas por cliente, sacadas del mismo agregado. */
export type ConteoCampanasActivas = Record<string, number>;

interface Resultado {
  state: ClientesAdminState;
  campanasActivas: ConteoCampanasActivas;
}

/**
 * Lista de clientes para el selector del administrador.
 *
 * SE LEE DEL AGREGADO, NO DE LA COLECCIÓN. El selector es la pantalla de
 * inicio de cualquier cuenta interna, así que esto corre en CADA inicio
 * de sesión. Antes eran dos consultas que crecían linealmente -- todos
 * los clientes, y todos los contratos vigentes para contar campañas
 * activas: con 1.000 clientes, ~3.000 documentos por sesión; con 10.000,
 * treinta mil.
 *
 * El agregado va EN PARTES (clientes-0, clientes-1...) porque un
 * documento de Firestore no pasa de 1 MB y los clientes sí pueden llegar
 * a decenas de miles. La parte 0 dice cuántas hay. Con menos de 2.000
 * clientes solo existe la 0: el selector se pinta con UNA lectura, y a
 * partir de ahí una más por cada 2.000 clientes.
 *
 * La búsqueda y el orden siguen haciéndose en memoria como siempre, así
 * que la experiencia no cambia: se sigue pudiendo buscar entre todos.
 *
 * SI EL AGREGADO NO ESTÁ, se lee la colección directamente. Más caro,
 * pero correcto: vale más pagar de más que dejar al admin sin poder
 * entrar a ninguna cuenta.
 */
export function useClientesAdmin(): ClientesAdminState {
  return useSelectorDeClientes().state;
}

export function useSelectorDeClientes(): Resultado {
  const [state, setState] = useState<ClientesAdminState>({ status: "loading" });
  const [campanasActivas, setCampanas] = useState<ConteoCampanasActivas>({});

  useEffect(() => {
    if (!db) { setState({ status: "ready", clientes: [] }); return; }
    const bd = db;
    let cancelado = false;
    const cortar: Array<() => void> = [];

    const publicar = (filas: FilaAgregada[]) => {
      if (cancelado) return;
      const conteo: ConteoCampanasActivas = {};
      filas.forEach((f) => { conteo[f.id] = f.campanasActivas ?? 0; });
      setCampanas(conteo);
      setState({ status: "ready", clientes: filas as unknown as Cliente[] });
    };

    // Respaldo: la colección entera, como se hacía antes.
    const leerColeccionDirecta = () => {
      if (cancelado) return;
      cortar.push(
        onSnapshot(
          query(collection(bd, "clientes"), orderBy("empresa", "asc")),
          (snap) => {
            if (cancelado) return;
            setState({
              status: "ready",
              clientes: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Cliente, "id">) })),
            });
          },
          (err) => { if (!cancelado) setState({ status: "error", message: err.message }); }
        )
      );
    };

    // Las partes que faltan se leen UNA VEZ (no en vivo): un cambio en un
    // cliente cualquiera regenera todas, y mantener N escuchas abiertas
    // volvería a cobrar N documentos en cada cambio. La parte 0 sí va en
    // vivo, que es la que cubre el caso normal.
    const leerPartesRestantes = async (partes: number, primera: FilaAgregada[]) => {
      const { getDoc } = await import("firebase/firestore");
      const resto = await Promise.all(
        Array.from({ length: partes - 1 }, (_, i) => getDoc(doc(bd, `agregados/clientes-${i + 1}`)))
      );
      if (cancelado) return;
      const filas = [...primera];
      resto.forEach((d) => {
        const datos = d.data() as { clientes?: FilaAgregada[] } | undefined;
        if (Array.isArray(datos?.clientes)) filas.push(...datos!.clientes!);
      });
      publicar(filas);
    };

    cortar.push(
      onSnapshot(
        doc(bd, "agregados/clientes-0"),
        (snap) => {
          if (cancelado) return;
          const datos = snap.data() as { clientes?: FilaAgregada[]; partes?: number } | undefined;
          if (!snap.exists() || !Array.isArray(datos?.clientes)) {
            console.warn(
              "No existe el agregado de clientes; se lee la colección directamente. " +
                "Lanza el barrido diario de paneles para generarlo."
            );
            leerColeccionDirecta();
            return;
          }
          const partes = Number(datos!.partes ?? 1) || 1;
          if (partes <= 1) { publicar(datos!.clientes!); return; }
          void leerPartesRestantes(partes, datos!.clientes!);
        },
        (err) => {
          // CUALQUIER fallo (incluido permiso denegado si las reglas aún
          // no están publicadas) cae al respaldo. Sin esto, el admin no
          // podría entrar a ninguna cuenta.
          console.warn(
            "No se pudo leer el agregado de clientes; se lee la colección directamente. " +
              "Revisa que las reglas permitan leer agregados/clientes-N al personal interno.",
            err
          );
          leerColeccionDirecta();
        }
      )
    );

    return () => { cancelado = true; cortar.forEach((c) => c()); };
  }, []);

  return { state, campanasActivas };
}

interface FilaAgregada {
  id: string;
  empresa: string;
  archived: boolean;
  avatarUrl: string;
  avatarKey: string;
  contacto: string;
  campanasActivas: number;
}
