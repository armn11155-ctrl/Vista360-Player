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
