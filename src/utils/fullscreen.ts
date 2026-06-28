// Fuerza pantalla completa real (oculta status bar + barra de navegación)
// usando la Fullscreen API del navegador. Esto es más confiable que el
// "display": "fullscreen" del manifest, que muchos navegadores/Android
// ignoran o no actualizan en PWAs ya instaladas.
//
// La Fullscreen API exige un gesto del usuario (tap/click), así que se
// dispara en cada toque mientras la app NO esté en fullscreen. Si el
// usuario sale (gesto de swipe del sistema), el siguiente toque la
// vuelve a activar automáticamente.

function isFullscreen(): boolean {
  const d = document as any;
  return Boolean(
    document.fullscreenElement ||
    d.webkitFullscreenElement ||
    d.mozFullScreenElement ||
    d.msFullscreenElement
  );
}

function requestFs() {
  const el = document.documentElement as any;
  const request =
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.mozRequestFullScreen ||
    el.msRequestFullscreen;
  if (request) {
    request.call(el).catch(() => {
      /* el navegador puede rechazar si no hay gesto válido; se reintenta en el próximo toque */
    });
  }
}

export function setupFullscreenOnTouch() {
  if (typeof document === "undefined") return;

  const tryEnter = () => {
    if (!isFullscreen()) requestFs();
  };

  // Primer intento apenas carga (funciona en algunos navegadores si la PWA
  // ya cuenta como "instalada"; si no, no pasa nada y se reintenta al tocar).
  tryEnter();

  document.addEventListener("pointerdown", tryEnter, { passive: true });
  document.addEventListener("touchstart", tryEnter, { passive: true });

  // Si el usuario sale de fullscreen (gesto del sistema), no hacemos nada
  // hasta el próximo toque: ahí "tryEnter" lo vuelve a pedir solo.
}
