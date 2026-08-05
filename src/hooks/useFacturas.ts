import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where, type FirestoreError } from "firebase/firestore";
import { db } from "../config/firebase";
import type { Factura } from "../types";

export type FacturasState =
  | { status: "loading" }
  | { status: "ready"; facturas: Factura[] }
  | { status: "error"; message: string };

/**
 * Facturas se identifican principalmente por RUC (cliente_doc) --
 * vienen de facturacion-web, un sistema distinto que comparte el mismo
 * Firebase. Pero un cliente sin RUC registrado tambien puede tener
 * facturas: las que el admin sube directo desde Vista360 Player,
 * guardadas con cliente_id en vez de cliente_doc. Por eso este hook
 * escucha ambas colecciones (por ruc y por clienteId) y las combina.
 */

/** "permission-denied" en CUALQUIERA de las dos consultas se trata
 *  como "esta consulta no tiene nada para mostrar", no como un error
 *  duro -- un cliente viendo SU PROPIA pantalla de Facturas nunca
 *  deberia toparse con un mensaje tecnico de permisos (eso es ruido
 *  de configuracion del lado de las reglas de Firestore, no algo que
 *  el cliente pueda hacer algo al respecto). La otra consulta puede
 *  seguir funcionando bien -- por ejemplo, un cliente sin RUC nunca
 *  iba a tener resultados por RUC de todos modos. Solo un error que
 *  NO sea de permisos (ej. sin conexion) sigue mostrandose como error
 *  real, para no esconder un problema genuino de red para siempre. */
function esPermisoDenegado(err: FirestoreError): boolean {
  return err.code === "permission-denied";
}

/**
 * UNA SOLA CONSULTA, NO DOS.
 *
 * Antes esto lanzaba DOS escuchas: una por RUC (cliente_doc) y otra por
 * cliente_id, y fusionaba los resultados quitando duplicados. La razón
 * era histórica: las facturas del antiguo sistema de facturación solo
 * traían el RUC. Pero como las que crea la app llevan AMBOS campos,
 * cada factura aparecía en las dos consultas -- se leía y se pagaba dos
 * veces para luego descartar la copia.
 *
 * Se comprobó contra los datos reales (scripts/migrar-facturas-clienteid.mjs):
 * NO existe ninguna factura con un RUC de cliente conocido a la que le
 * falte cliente_id. O sea que la consulta por RUC no aportaba ni una
 * factura que la otra no trajera ya.
 *
 * Y para que siga siendo cierto hacia adelante, crearFacturaAdmin ahora
 * EXIGE clienteId: sin él rechaza la factura en vez de guardarla sin ese
 * campo, que la volvería invisible para el cliente sin dar ningún error.
 *
 * `ruc` se mantiene en la firma porque las pantallas lo usan para otras
 * cosas y quitarlo obligaría a tocarlas sin ganar nada.
 */
export function useFacturas(ruc: string | undefined, clienteId?: string): FacturasState {
  const [porCliente, setPorCliente] = useState<Factura[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPorCliente(null);
    if (!db || !clienteId) {
      setPorCliente([]);
      return;
    }
    const bd = db;

    // SE LEE DEL RESUMEN, NO FACTURA POR FACTURA.
    //
    // Era una lectura por cada factura del cliente, sin tope: un cliente
    // con diez años de facturas mensuales pagaba 120 documentos cada vez
    // que abría esta pantalla. Ahora es 1, tenga 5 facturas o 500.
    //
    // Va en un documento APARTE del resumen de campañas a propósito: ese
    // se lee en cada sesión, y este solo cuando alguien abre Facturas.
    // Juntarlos habría hecho que todo el mundo cargase las facturas en
    // cada sesión aunque no las mirara.
    let cortar: (() => void) | null = null;

    // Respaldo: la consulta de siempre. Si el resumen no está todavía o
    // las reglas aún no lo permiten, se lee la colección: más caro, pero
    // el cliente ve sus facturas igual.
    const leerColeccionDirecta = () => {
      cortar = onSnapshot(
        query(collection(bd, "facturas"), where("cliente_id", "==", clienteId)),
        (snap) => {
          setError(null);
          setPorCliente(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Factura, "id">) })));
        },
        (err) => (esPermisoDenegado(err) ? setPorCliente([]) : setError(err.message))
      );
    };

    cortar = onSnapshot(
      doc(bd, `agregados/facturas-${clienteId}`),
      (snap) => {
        const datos = snap.data() as { facturas?: Factura[] } | undefined;
        if (!snap.exists() || !Array.isArray(datos?.facturas)) {
          console.warn(
            "No existe el resumen de facturas de este cliente; se lee la colección. " +
              "Lanza el barrido diario para generarlo."
          );
          leerColeccionDirecta();
          return;
        }
        setError(null);
        setPorCliente(datos!.facturas!);
      },
      (err) => {
        console.warn(
          "No se pudo leer el resumen de facturas; se lee la colección. " +
            "Revisa que las reglas permitan leer agregados/facturas-<id>.",
          err
        );
        leerColeccionDirecta();
      }
    );

    return () => { cortar?.(); };
  }, [clienteId]);

  if (error) return { status: "error", message: error };
  if (porCliente === null) return { status: "loading" };

  const facturas = [...porCliente].sort((a, b) => (b.numero ?? 0) - (a.numero ?? 0));

  return { status: "ready", facturas };
}
