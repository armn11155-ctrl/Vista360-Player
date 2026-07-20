import { env } from "../config/env";

declare global {
  interface Window {
    L?: any;
    google?: any;
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
 * Carga las teselas reales de Google Maps dentro del mapa Leaflet (plugin
 * leaflet.gridlayer.googlemutant) -- se usa en Cobertura.tsx para que el
 * mapa se vea como Google Maps de verdad en vez de OpenStreetMap, sin
 * perder los marcadores/popups propios de Vista360 que ya tenía el mapa.
 *
 * Es opcional a propósito: si no hay VITE_GOOGLE_MAPS_API_KEY configurada,
 * devuelve false de una vez y quien la llame debe seguir usando el
 * tileLayer de OpenStreetMap de siempre. Tampoco rompe nada si el script
 * falla en cargar (sin internet a Google, key inválida, etc.) -- en ese
 * caso también devuelve false.
 */
function cargarScript(id: string, src: string): Promise<void> {
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing) {
    return new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(`No se pudo cargar ${id}`)));
    });
  }
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`No se pudo cargar ${id}`));
    document.body.appendChild(script);
  });
}

export async function cargarGoogleMapsTiles(): Promise<boolean> {
  const apiKey = env.googleMapsApiKey;
  if (!apiKey) return false;

  try {
    if (!window.google?.maps) {
      await cargarScript("google-maps-js", `https://maps.googleapis.com/maps/api/js?key=${apiKey}`);
    }
    if (!window.L?.GridLayer?.GoogleMutant) {
      await cargarScript(
        "leaflet-google-mutant-js",
        "https://cdn.jsdelivr.net/npm/leaflet.gridlayer.googlemutant@0.16.0/dist/Leaflet.GoogleMutant.js"
      );
    }
    return Boolean(window.google?.maps && window.L?.GridLayer?.GoogleMutant);
  } catch {
    return false;
  }
}
