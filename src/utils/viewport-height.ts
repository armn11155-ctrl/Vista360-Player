// Mide la altura REAL de la pantalla con JavaScript (no CSS) y la fija
// como variable --app-height. Esto evita los bugs de 100vh/100dvh en
// Safari/WKWebView de iPhone instalado, que a veces no calculan bien
// el viewport contra la pantalla física real.
export function setupRealViewportHeight() {
  let stableHeight = window.visualViewport?.height || window.innerHeight;

  const isTextInputFocused = () => {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || el.getAttribute("contenteditable") === "true";
  };

  const set = () => {
    const visualHeight = window.visualViewport?.height ?? 0;
    const currentHeight = visualHeight || window.innerHeight;
    const keyboardLikelyOpen = isTextInputFocused() && visualHeight > 0 && visualHeight < stableHeight * 0.82;

    if (!keyboardLikelyOpen) {
      stableHeight = Math.max(currentHeight, window.innerHeight * 0.92);
    }

    document.documentElement.style.setProperty("--app-height", `${stableHeight}px`);
  };

  const resetAfterKeyboard = () => {
    window.setTimeout(() => {
      stableHeight = window.visualViewport?.height || window.innerHeight;
      set();
    }, 80);
  };

  set();
  window.addEventListener("resize", set);
  window.addEventListener("orientationchange", () => {
    stableHeight = 0;
    window.setTimeout(set, 250);
  });
  window.addEventListener("focusout", resetAfterKeyboard);
  window.addEventListener("blur", resetAfterKeyboard, true);
  window.addEventListener("focus", resetAfterKeyboard);
  window.addEventListener("pageshow", resetAfterKeyboard);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) resetAfterKeyboard();
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", set);
  }
}
