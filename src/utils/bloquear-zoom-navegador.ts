// Bloquea el zoom del NAVEGADOR (Ctrl+rueda, Ctrl+/-, pellizco de dos
// dedos en el trackpad de escritorio) en toda la app -- se pidió
// explícitamente porque esta es una app de layout fijo (como Figma o
// Notion), no un documento: si el navegador la agranda/achica con su
// propio zoom, los tamaños en píxeles fijos, el sidebar y el
// contenido se desalinean y se ve roto.
//
// En MÓVIL el pellizco para hacer zoom ya está bloqueado desde el
// meta viewport (user-scalable=no, ver index.html) -- esto acá es
// el equivalente para escritorio, donde ese meta tag no tiene ningún
// efecto (Ctrl+rueda es un atajo del navegador, no del viewport).
//
// El mapa de Cobertura NO se ve afectado: su zoom lo maneja Leaflet
// con sus propios botones +/- y gestos, completamente aparte del zoom
// del navegador -- de hecho, el mapa ya tiene scrollWheelZoom:false
// (la rueda sola no lo mueve), así que no hay ningún conflicto entre
// "la rueda zoomea el mapa" y "Ctrl+rueda zoomea la página": son dos
// cosas separadas y esto solo toca la segunda.
export function bloquearZoomDeNavegador() {
  // Ctrl+rueda (Windows/Linux) y el pellizco de trackpad en Chrome/Edge/
  // Firefox (que ese mismo navegador reporta como un "wheel" con
  // ctrlKey:true, sea cual sea el gesto físico real detrás). Tiene que
  // ir con { passive: false } -- si no, el navegador ignora el
  // preventDefault() y hace zoom igual.
  window.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false }
  );

  // Ctrl/Cmd + "+"/"-"/"=" (el "=" es la misma tecla que "+" sin
  // shift en la mayoría de los teclados) y Ctrl/Cmd + 0 (restablecer
  // zoom).
  window.addEventListener("keydown", (e) => {
    const teclaZoom = e.key === "+" || e.key === "-" || e.key === "=" || e.key === "0";
    if ((e.ctrlKey || e.metaKey) && teclaZoom) e.preventDefault();
  });

  // Pellizco de trackpad en Safari: no llega como "wheel" con ctrlKey
  // como en los demás navegadores -- Safari tiene su propio evento
  // "gesturestart"/"gesturechange" para esto, sin equivalente estándar
  // en otros navegadores. Si el navegador nunca dispara este evento,
  // el listener simplemente no hace nada, no rompe nada.
  window.addEventListener("gesturestart", (e) => e.preventDefault());
  window.addEventListener("gesturechange", (e) => e.preventDefault());
}
