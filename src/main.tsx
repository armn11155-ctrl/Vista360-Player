import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { recargarPorVersionDesactualizada } from "./utils/pantallaLazy";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { DialogosProvider } from "./components/DialogosProvider";
import "./styles/app.css";
import { setupRealViewportHeight } from "./utils/viewport-height";
import { bloquearZoomDeNavegador } from "./utils/bloquear-zoom-navegador";

setupRealViewportHeight();
bloquearZoomDeNavegador();

// Vite parte la app en pedazos (un archivo .js por pantalla, que se pide
// recién cuando el usuario entra a esa pantalla -- "Cobertura", "Paneles",
// etc). Cada despliegue nuevo les cambia el nombre a esos archivos. Si
// alguien tenía la pestaña abierta desde ANTES de un despliegue y recién
// ahora toca una pantalla que todavía no había cargado, el navegador pide
// el archivo viejo -- que ya no existe -- y eso se veía como la pantalla
// de "algo se rompió" del ErrorBoundary, aunque no hubiera ningún error
// real en el código: era una pestaña desactualizada, nada más.
//
// Se vio también como "'text/html' is not a valid JavaScript MIME type":
// Cloudflare Pages responde CUALQUIER ruta que no reconoce con el
// index.html de la app (200, no 404) -- si el navegador pide un chunk
// viejo que ya no existe, recibe HTML donde esperaba JS y truena al
// intentar ejecutarlo como módulo. sw.js ya no guarda esa respuesta mala
// en cache (ver el comentario ahí), pero la pestaña que ya la recibió
// igual necesita recargar para pedir la versión nueva.
//
// Recargar sola es la solución real en los dos casos -- por eso se hace
// automático, en vez de dejar a la persona mirando una pantalla rota sin
// saber que un F5 la arreglaba. Antes de recargar se le pide al Service
// Worker que vacíe su cache (mismo mensaje que usa logout() en
// firebase.ts) para no volver a toparse con una copia vieja guardada. El
// guard de sessionStorage evita un bucle infinito si por algún otro
// motivo la recarga no alcanza a resolverlo.
// La implementacion vive en utils/pantallaLazy.ts, junto al lazy() que
// tambien la usa. Aca solo se enchufan los dos eventos globales.
//
// SU GUARD ES POR TIEMPO, NO DE UNA SOLA VEZ. Antes era una marca en
// sessionStorage que no se borraba nunca: si la primera recarga no
// bastaba, quedaba puesta para toda la sesion y no se volvia a intentar
// NUNCA. La app se quedaba atascada en la pantalla que ya tenia cargada,
// sin error y sin poder navegar a ninguna otra.

window.addEventListener("vite:preloadError", recargarPorVersionDesactualizada);

// Red de seguridad para el caso de arriba cuando NO pasa por un import()
// que Vite esté vigilando -- por ejemplo el propio <script type="module">
// de entrada que Vite inyecta en index.html, o una hoja de estilos. Esos
// fallan con un evento "error" en el elemento <script>/<link>, que no
// burbujea (por eso el listener va con capture:true en window) y que
// "vite:preloadError" no cubre.
window.addEventListener(
  "error",
  (event) => {
    const el = event.target as HTMLElement | null;
    if (!el || (el.tagName !== "SCRIPT" && el.tagName !== "LINK")) return;
    const src = (el as HTMLScriptElement).src || (el as HTMLLinkElement).href || "";
    if (!src || new URL(src, location.href).origin !== location.origin) return;
    recargarPorVersionDesactualizada();
  },
  true
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Envuelve TODA la app: cualquier error de render que se escape queda
        atrapado acá en vez de dejar la pantalla en blanco. */}
    <ErrorBoundary>
      {/* Provee confirmar()/avisar() a toda la app -- reemplazo propio de
          window.confirm/alert, ver DialogosProvider.tsx. Va DENTRO del
          ErrorBoundary para que, si un diálogo rompiera algo, igual caiga
          en la pantalla de error normal y no en blanco. */}
      <DialogosProvider>
        <App />
      </DialogosProvider>
    </ErrorBoundary>
  </StrictMode>
);

// Fullscreen API por JS desactivado: cada toque pedía entrar/salir de
// fullscreen, redimensionando la pantalla en caliente — eso es lo que
// dejaba el vacío abajo. El ERP (que sí funciona bien) no usa esto en
// absoluto, solo confía en manifest "display": "standalone".
// import { setupFullscreenOnTouch } from "./utils/fullscreen";
// setupFullscreenOnTouch();

if ("serviceWorker" in navigator) {
  // El Service Worker avisa cuando se activa una version nueva. Sin
  // esto, una pestana abierta desde antes del despliegue se queda con el
  // JavaScript viejo: sus pantallas piden archivos que ya no existen y,
  // como se cargan dentro de un startTransition, el fallo NO produce
  // ningun error -- la pantalla simplemente no cambia al pulsar.
  navigator.serviceWorker?.addEventListener("message", (evento) => {
    if (evento.data?.tipo === "version-nueva") recargarPorVersionDesactualizada();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* sin service worker, el player sigue funcionando online */
    });
  });
}
