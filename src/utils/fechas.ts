/**
 * Fechas de campaña — un solo lugar.
 *
 * Las fechas de contrato (inicio/fin) se guardan como texto plano
 * "YYYY-MM-DD", sin hora ni zona. El error clásico es convertirlas con
 * `new Date("2026-07-31")`: JavaScript interpreta ese formato como
 * medianoche UTC, que en Perú (UTC-5) es el 30 de julio a las 7 p.m.
 * Comparado contra `new Date()` (hora local), una campaña que va hasta
 * el 31 se marcaba como "Finalizada" desde la tarde del día 30 -- casi
 * 29 horas antes de tiempo, para todos los clientes.
 *
 * La solución es no convertir a Date en absoluto: "YYYY-MM-DD" ordena
 * igual como texto que como fecha, así que comparar strings es exacto
 * y no tiene zona horaria de por medio. Lo único que sí necesita zona
 * es saber qué día es HOY, y eso se resuelve pidiéndole el día a
 * Intl con America/Lima explícito (mismo criterio que hoyEnLima() del
 * lado del servidor, en functions/src/notificacionesPush.ts).
 */

export const ZONA_PERU = "America/Lima";

/** Hoy en Perú como "YYYY-MM-DD". en-CA da exactamente ese formato. */
export function hoyEnPeru(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_PERU }).format(new Date());
}

/** Normaliza cualquier fecha guardada a "YYYY-MM-DD" para comparar. */
export function soloFecha(valor: string | undefined | null): string {
  return (valor ?? "").slice(0, 10);
}

/**
 * Días completos entre hoy (Perú) y una fecha. Positivo = falta;
 * 0 = es hoy; negativo = ya pasó. Se calcula en UTC a propósito: como
 * ambas puntas se construyen con la MISMA convención (mediodía UTC del
 * día calendario), el desfase se cancela y no hay riesgo de que el
 * horario de verano de otra zona corra el resultado en un día.
 */
export function diasHasta(fecha: string, hoy: string = hoyEnPeru()): number {
  const a = Date.parse(`${soloFecha(hoy)}T12:00:00Z`);
  const b = Date.parse(`${soloFecha(fecha)}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

/**
 * Porcentaje recorrido de una campaña (0-100). El día de fin cuenta
 * completo: una campaña llega a 100% recién cuando su último día ya
 * pasó, no cuando empieza.
 */
export function progresoCampana(inicio: string, fin: string, hoy: string = hoyEnPeru()): number {
  const total = diasHasta(fin, inicio) + 1;
  if (total <= 0) return 100;
  const transcurrido = diasHasta(hoy, inicio) + 1;
  if (transcurrido <= 0) return 0;
  if (transcurrido >= total) return 100;
  return Math.round((transcurrido / total) * 100);
}

/**
 * Suma (o resta, con negativo) días de calendario a una "YYYY-MM-DD" y
 * devuelve otra "YYYY-MM-DD". Se apoya en Date.UTC para que el acarreo
 * de fin de mes y fin de año lo resuelva el motor de JS, en vez de
 * calcularlo a mano -- pero sin que la zona horaria entre en juego,
 * porque tanto la entrada como la salida se manejan en UTC puro.
 */
export function sumarDias(fecha: string, dias: number): string {
  const base = soloFecha(fecha);
  const [anio, mes, dia] = base.split("-").map(Number);
  if (!anio || !mes || !dia) return base;
  const d = new Date(Date.UTC(anio, mes - 1, dia + dias));
  return d.toISOString().slice(0, 10);
}
