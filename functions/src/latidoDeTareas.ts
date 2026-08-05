import type { Firestore } from "firebase-admin/firestore";

/**
 * Marca de "esta tarea corrió" para los procesos periódicos.
 *
 * EL PROBLEMA QUE RESUELVE. Las tareas programadas son el punto ciego
 * perfecto: si dejan de correr, la aplicación sigue funcionando sin la
 * menor señal. No hay error, no hay pantalla rota, nadie recibe un aviso
 * de que no está recibiendo avisos.
 *
 * Y se paran solas por motivos aburridos: un secreto caduca, alguien
 * desactiva un workflow, GitHub apaga las tareas programadas de un
 * repositorio sin actividad, o el propio despliegue de esa función falla
 * (se despliegan con `set +e`, así que un fallo ahí no frena nada ni
 * avisa a nadie).
 *
 * Lo que se degrada no es visible desde dentro:
 *  - recordatorioVencimientoCampanas: nadie avisa al cliente de que su
 *    campaña vence. No renueva. Eso es dinero.
 *  - recordatorioReportesMensuales: los reportes se acumulan sin enviar.
 *
 * CÓMO SE DETECTA. Cada tarea deja aquí la fecha de su última ejecución.
 * Un documento, todas las tareas. El frontend lo lee UNA vez por sesión
 * de personal interno y avisa si alguna lleva demasiado sin latir.
 *
 * POR QUÉ UN SOLO DOCUMENTO: para que vigilarlas cueste una lectura, no
 * una por tarea. Y para que añadir una tarea nueva no requiera tocar
 * nada del frontend: basta con que llame a `latir()`.
 */

export const RUTA_LATIDOS = "agregados/tareas";

/** Nombres de las tareas periódicas. Lista cerrada a propósito: obliga a
 *  decidir conscientemente qué se vigila, en vez de acumular nombres
 *  sueltos escritos a mano que nadie sabe si siguen existiendo. */
export type TareaPeriodica =
  | "sincronizarEstadoPaneles"
  | "recordatorioVencimientoCampanas"
  | "recordatorioReportesMensuales";

/**
 * Anota que la tarea acaba de correr.
 *
 * NUNCA LANZA. Si esto fallara y tumbara la tarea, el guardián estaría
 * causando justo el fallo que vino a detectar.
 */
export async function latir(db: Firestore, tarea: TareaPeriodica): Promise<void> {
  try {
    await db.doc(RUTA_LATIDOS).set({ [tarea]: new Date().toISOString() }, { merge: true });
  } catch (error) {
    console.error(`No se pudo anotar el latido de ${tarea}.`, error);
  }
}
