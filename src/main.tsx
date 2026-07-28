import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles/app.css";
import { setupRealViewportHeight } from "./utils/viewport-height";

setupRealViewportHeight();

// Vite parte la app en pedazos (un archivo .js por pantalla, que se pide
// recién cuando el usuario entra a esa pantalla -- "Cobertura", "Paneles",
// etc). Cada despliegue nuevo les cambia el nombre a esos archivos. Si
// alguien tenía la pestaña abierta desde ANTES de un despliegue y recién
// ahora toca una pantalla que todavía no había cargado, el navegador pide
// el archivo viejo -- que ya no existe -- y eso se veía como la pantalla
// de "algo se rompió" del ErrorBoundary, aunque no hubiera ningún error
// real en el código: era una pestaña desactualizada, nada más.
//
// Vite avisa este caso puntual con el evento "vite:preloadError". Ahí la
// solución real es tan simple como recargar la página (así se trae la
// versión nueva, con los nombres de archivo correctos) -- por eso se hace
// solo, en vez de dejar que el usuario se quede mirando una pantalla rota
// sin saber que un F5 lo arreglaba. El guard de sessionStorage evita un
// bucle infinito si por algún otro motivo la recarga no alcanza a
// resolverlo.
window.addEventListener("vite:preloadError", () => {
  const YA_RECARGO = "vista360_recargo_por_chunk_viejo";
  if (sessionStorage.getItem(YA_RECARGO)) return;
  sessionStorage.setItem(YA_RECARGO, "1");
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Envuelve TODA la app: cualquier error de render que se escape queda
        atrapado acá en vez de dejar la pantalla en blanco. */}
    <ErrorBoundary>
      <App />
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
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* sin service worker, el player sigue funcionando online */
    });
  });
}
