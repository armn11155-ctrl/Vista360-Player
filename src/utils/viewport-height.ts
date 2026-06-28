// Mide la altura REAL de la pantalla con JavaScript (no CSS) y la fija
// como variable --app-height. Esto evita los bugs de 100vh/100dvh en
// Safari/WKWebView de iPhone instalado, que a veces no calculan bien
// el viewport contra la pantalla física real.
export function setupRealViewportHeight() {
  const set = () => {
    const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty("--app-height", `${h}px`);
  };
  set();
  window.addEventListener("resize", set);
  window.addEventListener("orientationchange", set);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", set);
  }
}
