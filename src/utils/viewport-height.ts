// Mide la altura REAL de la pantalla con JavaScript (no CSS) y la fija
// como variable --app-height. Esto evita los bugs de 100vh/100dvh en
// Safari/WKWebView de iPhone instalado, que a veces no calculan bien
// el viewport contra la pantalla física real.
export function setupRealViewportHeight() {
  const readViewportHeight = () => {
    const visualHeight = window.visualViewport?.height || 0;
    const innerHeight = window.innerHeight || 0;
    const clientHeight = document.documentElement.clientHeight || 0;
    return Math.round(Math.max(innerHeight, clientHeight, visualHeight));
  };

  let stableHeight = readViewportHeight();

  const isTextInputFocused = () => {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || el.getAttribute("contenteditable") === "true";
  };

  const set = () => {
    const visualHeight = window.visualViewport?.height ?? 0;
    const currentHeight = readViewportHeight();
    const keyboardLikelyOpen = isTextInputFocused() && visualHeight > 0 && visualHeight < stableHeight * 0.82;

    if (!keyboardLikelyOpen) {
      stableHeight = currentHeight;
    }

    document.documentElement.style.setProperty("--app-height", `${stableHeight}px`);
    document.documentElement.style.setProperty("--visual-height", `${currentHeight}px`);
  };

  const resetAfterKeyboard = () => {
    const reset = () => {
      stableHeight = readViewportHeight();
      set();
    };
    window.setTimeout(reset, 80);
    window.setTimeout(reset, 260);
    window.setTimeout(reset, 700);
  };

  set();
  window.addEventListener("resize", set);
  window.addEventListener("orientationchange", () => {
    stableHeight = 0;
    window.setTimeout(set, 250);
  });
  window.addEventListener("focusout", resetAfterKeyboard);
  window.addEventListener("blur", resetAfterKeyboard, true);
  window.addEventListener("pageshow", resetAfterKeyboard);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) resetAfterKeyboard();
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", set);
    window.visualViewport.addEventListener("scroll", resetAfterKeyboard);
  }
}
