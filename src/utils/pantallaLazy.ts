import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * lazy() que sabe recuperarse de un despliegue nuevo.
 *
 * EL PROBLEMA QUE RESUELVE. Cada pantalla es un archivo .js aparte que
 * se pide recién al entrar en ella, y cada despliegue les cambia el
 * nombre. Una pestaña abierta desde antes del despliegue pide archivos
 * que ya no existen. Cloudflare Pages, en vez de un 404, devuelve el
 * index.html de la app -- HTML donde se esperaba JavaScript.
 *
 * Y ASÍ ES COMO SE VE: NO se ve. setView() cambia la pantalla dentro de
 * un startTransition, y React no cambia nada hasta tener el código de la
 * pantalla nueva. Si ese código no llega, se queda mostrando la anterior
 * -- sin error, sin aviso, sin nada en la consola. La persona pulsa
 * "Campañas" y no pasa absolutamente nada. La única pantalla que sigue
 * funcionando es la que ya estaba cargada.
 *
 * Pasó de verdad, y costó horas encontrarlo precisamente porque no deja
 * rastro.
 *
 * QUÉ HACE ESTO. Si la carga falla: le pide al Service Worker que vacíe
 * su caché (que es donde puede estar guardada la copia envenenada) y
 * reintenta una vez. Si vuelve a fallar, recarga la página entera, que
 * es lo único que trae el index.html nuevo con los nombres correctos.
 */

/** Vacía la caché del Service Worker y espera a que confirme. */
function limpiarCacheDelServiceWorker(): Promise<void> {
  return new Promise((resolver) => {
    const sw = navigator.serviceWorker;
    if (!sw?.controller) { resolver(); return; }
    // Si el Service Worker no contesta, seguir igual: reintentar sin
    // limpiar es mejor que quedarse esperando para siempre.
    const rendirse = setTimeout(resolver, 1500);
    const canal = new MessageChannel();
    canal.port1.onmessage = () => { clearTimeout(rendirse); resolver(); };
    try {
      sw.controller.postMessage({ tipo: "limpiar-cache" }, [canal.port2]);
    } catch {
      clearTimeout(rendirse);
      resolver();
    }
  });
}

/**
 * Recarga la página, pero solo si no se ha recargado hace muy poco.
 *
 * El guard es POR TIEMPO, no de una sola vez. Antes era una marca en
 * sessionStorage que no se borraba nunca: si la primera recarga no
 * bastaba, quedaba puesta para toda la sesión y ya no se volvía a
 * intentar NUNCA -- que es exactamente cómo se llega a la app atascada
 * en una sola pantalla. Con ventana de tiempo se evita el bucle infinito
 * pero se permite reintentar más tarde.
 */
export function recargarPorVersionDesactualizada(): void {
  const CLAVE = "vista360_ultima_recarga_por_chunk";
  const VENTANA_MS = 30_000;
  const ultima = Number(sessionStorage.getItem(CLAVE) ?? 0);
  if (Date.now() - ultima < VENTANA_MS) return;
  sessionStorage.setItem(CLAVE, String(Date.now()));
  void limpiarCacheDelServiceWorker().finally(() => window.location.reload());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pantallaLazy<T extends ComponentType<any>>(
  cargar: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await cargar();
    } catch (primerFallo) {
      console.warn("No se pudo cargar la pantalla; se limpia la caché y se reintenta.", primerFallo);
      await limpiarCacheDelServiceWorker();
      try {
        return await cargar();
      } catch (segundoFallo) {
        console.error("La pantalla sigue sin cargar; se recarga la aplicación.", segundoFallo);
        recargarPorVersionDesactualizada();
        // Se relanza para que el ErrorBoundary muestre algo mientras la
        // recarga ocurre, en vez de dejar la transición colgada.
        throw segundoFallo;
      }
    }
  });
}
