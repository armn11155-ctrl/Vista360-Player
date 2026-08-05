import type { Firestore, Transaction } from "firebase-admin/firestore";

/** Forma mínima que necesitan crearContrato/actualizarContrato. */
export interface ContratoFila {
  cliente_id?: string;
  panel_id?: string;
  panel_ids?: string[];
  inicio?: string;
  fin?: string;
  deleted?: boolean;
}

/**
 * ¿Es este error un "falta el índice" de Firestore?
 *
 * Firestore devuelve FAILED_PRECONDITION con un mensaje que incluye un
 * enlace para crear el índice. Se detecta por código Y por mensaje
 * porque failed-precondition también lo usan otros errores.
 */
function esFaltaDeIndice(error: unknown): boolean {
  const e = error as { code?: number | string; message?: string };
  const mensaje = String(e?.message ?? "").toLowerCase();
  return mensaje.includes("index") && (mensaje.includes("requires") || mensaje.includes("building"));
}

/**
 * Trae los contratos que PODRÍAN chocar con una campaña que va del
 * `inicio` en adelante en los paneles indicados.
 *
 * Dos niveles de filtrado, los dos hechos por Firestore (no en memoria):
 *
 *  1. POR PANEL. Antes esto leía la colección `contratos` entera en cada
 *     creación/edición: una cuenta que crecía con todo el negocio y que
 *     habría terminado degradando sola con los años.
 *
 *  2. POR FECHA (`fin >= inicio`). Un contrato que terminó ANTES de que
 *     empiece la campaña nueva no puede cruzarse con ella jamás, así que
 *     no hay motivo para traerlo. Esto deja fuera todo el historial
 *     viejo del panel: se leen solo los contratos vigentes o futuros.
 *     Hay una prueba exhaustiva (src/logica-negocio/filtroPorFecha.test.ts,
 *     ~672.000 combinaciones) que verifica que este filtro NO puede
 *     esconder ningún cruce real -- si pudiera, se vendería dos veces el
 *     mismo panel sin ningún error visible.
 *
 * Se consulta dos veces por panel porque hay dos formatos de contrato
 * conviviendo: `panel_ids` (campañas multi-panel, el formato actual) y
 * `panel_id` suelto (contratos viejos). Se unen por id del documento
 * para no contar dos veces el mismo contrato.
 *
 * RESPALDO ANTE ÍNDICE AUSENTE
 * El filtro por fecha necesita un índice compuesto (ver
 * firestore.indexes.json). Si por lo que sea no está disponible --
 * todavía construyéndose tras un despliegue, un proyecto nuevo sin
 * índices, o alguien que lo borró-- Firestore rechaza la consulta. En
 * ese caso NO se deja caer la operación: se reintenta sin el filtro de
 * fecha, que es exactamente lo que hacía antes. Se lee de más y va algo
 * más lento, pero crear campañas nunca deja de funcionar y la
 * validación de cruces sigue siendo la misma. Degradar el rendimiento
 * es aceptable; bloquear al usuario, no.
 */
export async function contratosQuePuedenChocar(
  db: Firestore,
  tx: Transaction,
  panelIds: string[],
  inicio: string
): Promise<Map<string, ContratoFila>> {
  const relevantes = new Map<string, ContratoFila>();

  for (const panelId of panelIds) {
    const porLista = db.collection("contratos").where("panel_ids", "array-contains", panelId);
    const porUnico = db.collection("contratos").where("panel_id", "==", panelId);

    let docs;
    try {
      const [a, b] = await Promise.all([
        tx.get(porLista.where("fin", ">=", inicio)),
        tx.get(porUnico.where("fin", ">=", inicio)),
      ]);
      docs = [...a.docs, ...b.docs];
    } catch (error) {
      if (!esFaltaDeIndice(error)) throw error;
      console.warn(
        "Falta el índice compuesto de contratos (panel + fin); se consulta sin filtro de fecha. " +
          "Revisa el despliegue de firestore.indexes.json.",
        error
      );
      const [a, b] = await Promise.all([tx.get(porLista), tx.get(porUnico)]);
      docs = [...a.docs, ...b.docs];
    }

    docs.forEach((d) => relevantes.set(d.id, d.data() as ContratoFila));
  }

  return relevantes;
}
