import { useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";

/**
 * Avisa si alguna tarea periódica dejó de correr.
 *
 * LAS TAREAS PROGRAMADAS SON EL PUNTO CIEGO PERFECTO. Si se paran, la
 * aplicación sigue funcionando sin la menor señal: no hay error, no hay
 * pantalla rota, y nadie recibe un aviso de que no está recibiendo
 * avisos. Se descubre semanas después, por casualidad.
 *
 * Y se paran por motivos aburridos: un secreto que caduca, un workflow
 * desactivado, GitHub apagando las tareas de un repositorio sin
 * actividad, o el despliegue de esa función fallando en silencio.
 *
 * QUÉ SE DEGRADA si cada una se para:
 *  - sincronizarEstadoPaneles: el estado de los paneles se congela. Una
 *    campaña terminada anoche sigue apareciendo como ocupada.
 *  - recordatorioVencimientoCampanas: nadie avisa al cliente de que su
 *    campaña vence. No renueva. Eso es dinero.
 *  - recordatorioReportesMensuales: los reportes se acumulan sin enviar.
 *
 * COSTE: UNA lectura por sesión de personal interno, y de una sola vez
 * (getDoc, no una escucha). Los clientes no pagan nada: no lo leen.
 */

/** Cada cuánto DEBE latir cada tarea, en días, más un margen. Todas son
 *  diarias; se toleran 2 días para no avisar por un retraso del cron o
 *  un despliegue en marcha. */
const TOLERANCIA_DIAS = 2;

const TAREAS: Record<string, string> = {
  sincronizarEstadoPaneles:
    "El estado de los paneles se congela: una campaña terminada puede seguir apareciendo como ocupada.",
  recordatorioVencimientoCampanas:
    "Nadie avisa a los clientes de que su campaña vence. Pueden no renovar.",
  recordatorioReportesMensuales:
    "No se recuerdan los reportes mensuales pendientes.",
};

let yaRevisado = false;

export function useTareasPeriodicas(esPersonalInterno: boolean): void {
  useEffect(() => {
    // Una sola vez por carga de la página: esto no cambia de un minuto
    // a otro, y repetirlo solo costaría lecturas.
    if (!esPersonalInterno || !db || yaRevisado) return;
    yaRevisado = true;

    const bd = db;
    void (async () => {
      try {
        const snap = await getDoc(doc(bd, "agregados", "tareas"));
        const datos = (snap.data() ?? {}) as Record<string, unknown>;
        const ahora = Date.now();
        const paradas: Array<{ tarea: string; dias: number; consecuencia: string }> = [];

        for (const [tarea, consecuencia] of Object.entries(TAREAS)) {
          const marca = datos[tarea];
          if (typeof marca !== "string") {
            // Sin marca: o nunca corrió, o es la primera vez tras
            // desplegar esto. Se avisa igual -- si a los dos días sigue
            // sin marca, es que de verdad no corre.
            paradas.push({ tarea, dias: -1, consecuencia });
            continue;
          }
          const cuando = Date.parse(marca);
          if (Number.isNaN(cuando)) continue;
          const dias = (ahora - cuando) / 86400000;
          if (dias >= TOLERANCIA_DIAS) {
            paradas.push({ tarea, dias: Math.floor(dias), consecuencia });
          }
        }

        if (paradas.length === 0) return;

        // "Nunca ha corrido" y "lleva días sin correr" NO son lo mismo, y
        // confundirlos hace ruido: la primera vez que se despliega esto,
        // ninguna tarea ha latido todavía y el aviso salta entero aunque
        // no pase nada malo. Se separan para que el mensaje diga qué
        // hacer en cada caso.
        const nuncaCorrieron = paradas.filter((p) => p.dias === -1);
        const seDetuvieron = paradas.filter((p) => p.dias !== -1);
        const soloEstreno = seDetuvieron.length === 0;

        console.error("[tarea periódica detenida]", {
          ...(soloEstreno
            ? {
                ojo:
                  "Ninguna ha latido TODAVÍA. Si acabas de desplegar, es lo normal: cada tarea " +
                  "deja su marca la primera vez que corre. Vuelve a mirar mañana. Si en 48 h " +
                  "siguen diciendo lo mismo, entonces sí es que no están desplegadas.",
                nuncaHanCorrido: nuncaCorrieron.length,
              }
            : {}),
          tareas: paradas.map((p) => ({
            nombre: p.tarea,
            diasSinCorrer: p.dias === -1 ? "nunca ha corrido" : p.dias,
            consecuencia: p.consecuencia,
          })),
          queHacer:
            "Revisar en GitHub Actions el workflow correspondiente y, para las tareas de avisos, " +
            "que la función esté realmente desplegada (se despliegan tolerando fallos).",
        });
      } catch {
        // Sin permiso o sin conexión: no es asunto de este guardián.
        // Callar es lo correcto -- un guardián ruidoso deja de leerse.
      }
    })();
  }, [esPersonalInterno]);
}
