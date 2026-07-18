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
