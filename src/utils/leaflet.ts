declare global {
  interface Window {
    L?: any;
  }
}

/**
 * Carga Leaflet (mapa) desde CDN una sola vez -- lo usan tanto
 * Cobertura.tsx (ver paneles en el mapa) como Paneles.tsx (elegir la
 * ubicación de un panel nuevo con un click). Si ya está cargado
 * (window.L existe) resuelve al toque.
 */
export function cargarLeaflet(): Promise<any> {
  if (window.L) return Promise.resolve(window.L);

  const cssId = "leaflet-css";
  if (!document.getElementById(cssId)) {
    const link = document.createElement("link");
    link.id = cssId;
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
  }

  const scriptId = "leaflet-js";
  const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
  if (existing) {
    return new Promise<any>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(window.L));
      existing.addEventListener("error", reject);
    });
  }

  return new Promise<any>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

/**
 * El zoom más alejado que se puede mostrar sin que aparezcan franjas
 * grises (zonas del mapa donde no hay mundo que dibujar).
 *
 * El mapa del mundo en Leaflet/Web Mercator es siempre CUADRADO en
 * píxeles a cualquier zoom: 256 * 2^zoom de lado, tanto de ancho como
 * de alto. Un recuadro de mapa que no sea cuadrado (un celular es más
 * alto que ancho; una pantalla ancha es más ancha que alta) sólo se
 * llena por completo, sin gris en ningún lado, cuando ese cuadrado de
 * mundo es al menos tan grande como el lado MÁS LARGO del recuadro.
 * Si se llenara solo por el lado corto, sobraría gris en el otro.
 *
 * Por eso la cuenta usa el lado más largo (Math.max(ancho, alto)) y
 * redondea hacia arriba: el zoom entero más chico (o sea, el más
 * alejado posible) para el que el mundo ya no deja ver gris en ese
 * recuadro exacto.
 */
export function zoomMinimoSinGris(anchoPx: number, altoPx: number): number {
  const lado = Math.max(anchoPx, altoPx);
  if (!Number.isFinite(lado) || lado <= 0) return 2;
  return Math.max(0, Math.ceil(Math.log2(lado / 256)));
}
