import { useRef } from "react";

/**
 * Avisa cuando un componente se renderiza de forma desbocada.
 *
 * POR QUÉ HACE FALTA, habiendo detectores estáticos. Porque un análisis
 * del código solo encuentra los patrones que alguien ya conoce, y dentro
 * de un archivo. Un bucle puede formarse ENTRE archivos --un hook en A
 * que recibe un valor inestable de B, que lo saca de C-- o por una vía
 * que todavía no se nos ha ocurrido.
 *
 * Y hace falta porque este fallo NO SE MANIFIESTA: no lanza excepción,
 * el DOM ni se mueve, y lo único visible es que los cambios de pantalla
 * dejan de completarse. Sin un aviso explícito, esa es la única pista.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ES LA ÚLTIMA LÍNEA DE DEFENSA, NO UNA ALFOMBRA.
 *
 * Un guardián que se dispara de más es peor que no tenerlo: se aprende a
 * ignorarlo y deja de avisar cuando de verdad hace falta. Por eso NO
 * basta con "muchos renders": hacen falta las TRES señales a la vez.
 *
 *  1. RITMO ALTO. Más de 60 renders en una ventana de un segundo.
 *
 *  2. SOSTENIDO. Al menos 3 ventanas seguidas. Un pico aislado es lo
 *     normal cuando algo se monta o llegan varios datos de golpe; un
 *     bucle no para.
 *
 *  3. SIN QUE NADIE TOQUE NADA. Ninguna interacción en los últimos 2
 *     segundos. Esto es lo que separa un bucle de un uso intenso:
 *     arrastrar el marcador del mapa, redimensionar la ventana o
 *     escribir rápido en un buscador SÍ producen decenas de renders por
 *     segundo, y son perfectamente sanos. Un bucle, por definición, se
 *     alimenta solo.
 *
 * Con las tres, un falso positivo exige que la aplicación se renderice
 * 180 veces en tres segundos sin que nadie la esté tocando. Eso no es
 * uso intenso: eso es el fallo.
 * ─────────────────────────────────────────────────────────────────────
 *
 * COSTE: un contador y dos comparaciones de números por render, más un
 * par de escuchas pasivas registradas UNA vez en toda la vida de la
 * página. Nada medible. Por eso corre también en producción: el bucle
 * que costó un día entero ocurrió justo ahí, no en desarrollo.
 */

const RENDERS_POR_VENTANA = 60;
const VENTANA_MS = 1000;
const VENTANAS_SEGUIDAS = 3;
const SILENCIO_MS = 2000;

/** Momento de la última interacción real de la persona. */
let ultimaInteraccion = 0;
let escuchasPuestas = false;

function asegurarEscuchas(): void {
  if (escuchasPuestas || typeof window === "undefined") return;
  escuchasPuestas = true;
  const marcar = () => { ultimaInteraccion = Date.now(); };
  // `passive` y `capture`: no interfieren con nada de la aplicación y se
  // enteran aunque el evento se detenga más abajo.
  for (const evento of ["pointerdown", "pointermove", "keydown", "wheel", "touchmove", "resize"]) {
    window.addEventListener(evento, marcar, { passive: true, capture: true });
  }
}

/** Contexto para el diagnóstico. Lo rellena la aplicación. */
let rutaActual = "";
export function anotarRutaActual(ruta: string): void {
  rutaActual = ruta;
}

export function useDetectorDeBucles(nombre: string): void {
  asegurarEscuchas();

  const cuenta = useRef(0);
  const desde = useRef(0);
  const ventanasSeguidas = useRef(0);
  const yaAvisado = useRef(false);

  const ahora = Date.now();
  cuenta.current += 1;

  if (ahora - desde.current > VENTANA_MS) {
    // Se cierra la ventana anterior y se decide si contó como sospechosa.
    const fueIntensa = cuenta.current > RENDERS_POR_VENTANA;
    ventanasSeguidas.current = fueIntensa ? ventanasSeguidas.current + 1 : 0;
    if (!fueIntensa) yaAvisado.current = false;
    desde.current = ahora;
    cuenta.current = 1;
  }

  const silencio = ahora - ultimaInteraccion;
  const hayEvidencia =
    ventanasSeguidas.current >= VENTANAS_SEGUIDAS && silencio > SILENCIO_MS && !yaAvisado.current;

  if (hayEvidencia) {
    yaAvisado.current = true;
    // Solo datos técnicos: nombre del componente, pantalla y tiempos.
    // NADA de identificadores de cliente, nombres de empresa ni
    // contenido -- esto puede acabar en la consola de cualquiera.
    console.error("[bucle de renderizado]", {
      componente: nombre,
      pantalla: rutaActual || "(desconocida)",
      ventanasSeguidas: ventanasSeguidas.current,
      rendersEnLaUltimaVentana: cuenta.current,
      segundosSinInteraccion: Math.round(silencio / 1000),
      queSignifica:
        "Se está renderizando sin parar y sin que nadie toque la app. Casi seguro hay una " +
        "dependencia inestable: algo creado durante el render (filter, map, un objeto, un `[]`) " +
        "que llega a un useEffect que hace setState. Mientras dure, los cambios de pantalla no " +
        "se completan.",
    });
  }
}
