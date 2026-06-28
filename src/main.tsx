import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/app.css";
import { setupFullscreenOnTouch } from "./utils/fullscreen";
import { setupRealViewportHeight } from "./utils/viewport-height";

setupRealViewportHeight();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

setupFullscreenOnTouch();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* sin service worker, el player sigue funcionando online */
    });
  });
}
