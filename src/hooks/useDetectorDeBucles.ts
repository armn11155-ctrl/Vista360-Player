import { useRef } from "react";

/**
 * Avisa cuando un componente se renderiza de forma desbocada.
 *
 * POR QUÉ HACE FALTA, habiendo detectores estáticos. Porque un análisis
 * del código solo encuentra los patrones que alguien ya conoce, y dentro
 * de un archivo. Un bucle puede formarse ENTRE archivos --un hook en A
 * que recibe un valor inestable de B, que a su vez lo saca de C-- o por
 * una vía que no se nos ha ocurrido todavía.
 *
 * Este es la red de abajo: no le importa CÓMO se formó el bucle, solo
 * que está ocurriendo.
 *
 * Y es necesario porque este fallo NO SE MANIFIESTA. No lanza ninguna
 * excepción, el DOM ni se mueve (React re-renderiza y produce lo mismo)
 * y la única consecuencia visible es que las transiciones dejan de
 * completarse: se pulsa un botón y no pasa nada. Sin un aviso explícito,
 * la única pista es esa, y no lleva a ninguna parte.
 *
 * COSTE: un contador y una comparación de números por render. Nada que
 * se pueda medir. Por eso corre también en producción: el bucle que nos
 * costó un día entero ocurrió justo ahí, no en desarrollo.
 */

/** Renders en la ventana a partir de los cuales algo va claramente mal.
 *  Una interacción normal provoca unos pocos; nunca decenas. */
const LIMITE = 50;
const VENTANA_MS = 1000;

export function useDetectorDeBucles(nombre: string): void {
  const cuenta = useRef(0);
  const desde = useRef(0);
  const yaAvisado = useRef(false);

  const ahora = Date.now();
  if (ahora - desde.current > VENTANA_MS) {
    desde.current = ahora;
    cuenta.current = 0;
    yaAvisado.current = false;
  }
  cuenta.current += 1;

  // Se avisa UNA sola vez por ventana: si hay un bucle, escribir en cada
  // render llenaría la consola y encima empeoraría el problema.
  if (cuenta.current > LIMITE && !yaAvisado.current) {
    yaAvisado.current = true;
    console.error(
      `[bucle de renderizado] "${nombre}" se ha renderizado ${cuenta.current} veces en menos de un segundo. ` +
        "Casi seguro hay una dependencia inestable: algo creado durante el render (filter, map, un objeto, " +
        "un `[]`) que llega a un useEffect que hace setState. Mientras dure, los cambios de pantalla no se " +
        "van a completar."
    );
  }
}
