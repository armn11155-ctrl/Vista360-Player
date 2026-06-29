import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/app.css";
import { setupRealViewportHeight } from "./utils/viewport-height";

setupRealViewportHeight();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
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
