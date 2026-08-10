type OrientacionConBloqueo = ScreenOrientation & {
  lock?: (orientacion: "portrait-primary") => Promise<void>;
};

const esDispositivoMovil = () => {
  const tactil = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const ladoCorto = Math.min(window.screen?.width || 0, window.screen?.height || 0);
  return tactil && ladoCorto > 0 && ladoCorto <= 1024;
};

const intentarBloqueoVertical = () => {
  if (!esDispositivoMovil()) return;

  const orientacion = window.screen?.orientation as OrientacionConBloqueo | undefined;
  if (typeof orientacion?.lock !== "function") return;

  try {
    void orientacion.lock("portrait-primary").catch(() => {
      // Safari/iOS y algunos navegadores solo respetan la orientación del
      // manifest. El rechazo no debe bloquear ni ensuciar el login.
    });
  } catch {
    // Algunos WebViews antiguos lanzan el error de forma síncrona.
  }
};

/**
 * Refuerza la orientación vertical declarada en el manifest cuando el
 * navegador ofrece Screen Orientation API. El primer toque cubre motores
 * que exigen una interacción del usuario antes de aceptar lock().
 */
export function mantenerOrientacionVertical() {
  intentarBloqueoVertical();

  window.addEventListener("pageshow", intentarBloqueoVertical);
  window.addEventListener("orientationchange", intentarBloqueoVertical);
  window.addEventListener("pointerdown", intentarBloqueoVertical, { once: true, passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) intentarBloqueoVertical();
  });
}
