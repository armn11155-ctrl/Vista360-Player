/**
 * Reglas PURAS de ocupación de un panel: solo cálculo, sin tocar
 * Firestore ni nada del entorno del backend.
 *
 * Están en su propio archivo (y no dentro de estadoPaneles.ts, que es
 * de donde salieron) por un motivo concreto: son la regla de negocio
 * más importante de la app -- deciden si un soporte está lleno y desde
 * cuándo se libera un cupo -- y por eso conviene poder probarlas desde
 * la suite de tests del frontend, que es donde corre vitest.
 *
 * Cuando vivían junto a recalcularEstadoPaneles(), importarlas desde un
 * test arrastraba también `import type { Firestore } from
 * "firebase-admin/firestore"`, y el build del frontend (que no instala
 * las dependencias de functions/) fallaba con "Cannot find module
 * 'firebase-admin/firestore'". El fallo NO aparecía en local, porque
 * ahí sí existe functions/node_modules y TypeScript lo encontraba
 * subiendo por el árbol de carpetas -- solo se veía en el despliegue,
 * que parte de un checkout limpio.
 *
 * Regla para no repetirlo: acá adentro NO se importa nada. Si un
 * cálculo necesita Firestore, va en estadoPaneles.ts, no acá.
 */

/** "Hoy" en Lima como "YYYY-MM-DD" -- mismo criterio que hoyEnLima() en
 *  notificacionesPush.ts y que hoyEnPeru() en el frontend (src/utils/fechas.ts). */
export function hoyEnLima(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

/** Día siguiente a una "YYYY-MM-DD" -- el soporte queda libre recién
 *  cuando termina la campaña que lo ocupa, no el mismo día. */
export function sumarUnDia(fecha: string): string {
  const [a, m, d] = fecha.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return fecha;
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * A partir de las fechas de fin de los contratos VIGENTES HOY en un
 * panel y su cupo (1 en lona/mural/paradero, 2 en unipolar, Infinity en
 * LED), decide si el panel está lleno y desde cuándo se libera un cupo.
 *
 * Con cupo > 1 (unipolar) el próximo cupo se libera cuando termina el
 * MÁS CERCANO de los contratos activos que sobran para volver a estar
 * bajo el cupo -- no el que termina más lejos (ese era el bug binario
 * de antes: con 2 caras ocupadas, alcanza con que UNA se libere).
 */
export function estadoDesdeActivos(
  cupos: number,
  finsActivos: string[]
): { ocupado: boolean; libreDesde: string | null } {
  if (!Number.isFinite(cupos)) return { ocupado: false, libreDesde: null };
  if (finsActivos.length < cupos) return { ocupado: false, libreDesde: null };
  const ordenados = [...finsActivos].sort();
  const idx = finsActivos.length - cupos;
  return { ocupado: true, libreDesde: sumarUnDia(ordenados[idx]) };
}

/** Forma mínima de un contrato para decidir cruces de fechas. Se declara
 *  acá (y no se importa del tipo completo) para que este archivo siga
 *  sin depender de nada. */
export interface ContratoParaCruce {
  cliente_id?: string;
  panel_id?: string;
  panel_ids?: string[];
  inicio?: string;
  fin?: string;
  deleted?: boolean;
}

/** Los paneles que ocupa un contrato, soportando tanto el formato viejo
 *  (panel_id suelto) como el nuevo (panel_ids). Equivalente a
 *  panelesDeContrato() del frontend. */
export function panelesDelContrato(c: ContratoParaCruce): string[] {
  if (c.panel_ids && c.panel_ids.length > 0) return c.panel_ids;
  return c.panel_id ? [c.panel_id] : [];
}

/** ¿Dos rangos de fechas "YYYY-MM-DD" se pisan? Inclusivo en ambos
 *  extremos: si una campaña termina el mismo día que empieza otra, la
 *  lona no se puede cambiar a mitad de día, así que cuenta como cruce. */
export function seCruzan(aInicio: string, aFin: string, bInicio: string, bFin: string): boolean {
  return bInicio <= aFin && aInicio <= bFin;
}

/**
 * De una lista de contratos, cuáles chocan con las fechas pedidas en un
 * panel concreto. Es la regla que impide vender dos veces el mismo
 * espacio físico, así que se aísla acá para poder probarla sin Firestore.
 *
 * `soporteLimitado` distingue los dos modelos de negocio:
 *  - false (pantalla LED): rota anuncios en bucle, varios clientes
 *    conviven; solo molesta que el MISMO cliente se cruce consigo mismo.
 *  - true (lona/mural/paradero/unipolar): es una pieza física instalada,
 *    así que cuenta el cruce con CUALQUIER cliente.
 */
export function cruces(
  contratos: ContratoParaCruce[],
  opciones: {
    panelId: string;
    inicio: string;
    fin: string;
    clienteId: string;
    soporteLimitado: boolean;
    /** Contrato que se está editando: no debe chocar consigo mismo. */
    excluirId?: string;
  },
  idDe: (c: ContratoParaCruce) => string | undefined = () => undefined
): ContratoParaCruce[] {
  return contratos.filter((c) => {
    if (c.deleted || !c.inicio || !c.fin) return false;
    if (opciones.excluirId && idDe(c) === opciones.excluirId) return false;
    if (!opciones.soporteLimitado && String(c.cliente_id ?? "") !== opciones.clienteId) return false;
    if (!seCruzan(opciones.inicio, opciones.fin, c.inicio, c.fin)) return false;
    return panelesDelContrato(c).includes(opciones.panelId);
  });
}

/** ¿Se llegó al tope del soporte? Con cupo limitado se bloquea recién
 *  cuando ya hay tantas campañas cruzadas como cupos (1 en lona/mural/
 *  paradero, 2 en unipolar). Sin cupo (LED), basta con un solo cruce
 *  del propio cliente. */
export function limiteAlcanzado(cantidadCruces: number, cupos: number): boolean {
  return Number.isFinite(cupos) ? cantidadCruces >= cupos : cantidadCruces > 0;
}
