import { useEffect, useRef, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../config/firebase";

/**
 * Las URLs de R2 son privadas y expiran (6h). Este hook recibe una
 * lista de keys (fotos/videos/avatares/reportes) y devuelve un mapa
 * { key -> url firmada }, pidiéndolas en lote a firmarUrlsR2 y
 * cacheándolas en memoria mientras dure la sesión para no re-firmar
 * de más.
 */

const MARGEN_MS = 30 * 60 * 1000; // renovar 30 min antes de expirar
const DURACION_MS = 6 * 60 * 60 * 1000;
const MAX_POR_LOTE = 60;
const STORAGE_KEY = "v360_signed_urls_v1";

// Guardar en localStorage (no sessionStorage) es lo que realmente
// hace la diferencia en velocidad: una key firmada sigue sirviendo
// aunque se cierre la pestaña o se reinicie la app — mientras no haya
// pasado su vencimiento (6h) no hay que volver a pedirle nada al
// servidor, la foto aparece al toque desde el primer render. Es
// seguro guardarlas así porque cada URL ya trae su propio vencimiento
// (revisado abajo al cargar) y solo sirve para ese objeto puntual del
// bucket privado, igual que si viviera 6h en memoria.
function cargarCacheInicial(): Map<string, { url: string; expiraEn: number }> {
  const mapa = new Map<string, { url: string; expiraEn: number }>();
  try {
    const crudo = localStorage.getItem(STORAGE_KEY);
    if (!crudo) return mapa;
    const datos = JSON.parse(crudo) as Record<string, { url: string; expiraEn: number }>;
    const ahora = Date.now();
    Object.entries(datos).forEach(([key, valor]) => {
      if (valor && valor.expiraEn > ahora) mapa.set(key, valor);
    });
  } catch {
    // localStorage no disponible (modo privado, etc.) o datos corruptos — no pasa nada, se firma de nuevo.
  }
  return mapa;
}

const CACHE = cargarCacheInicial();

function guardarCache() {
  try {
    const datos: Record<string, { url: string; expiraEn: number }> = {};
    CACHE.forEach((valor, key) => { datos[key] = valor; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(datos));
  } catch {
    // Si falla (cuota llena, modo privado), simplemente no persiste — la caché en memoria sigue funcionando igual.
  }
}

async function firmar(keys: string[]): Promise<Record<string, string>> {
  const functions = getFunctions(app ?? undefined);
  const firmarUrlsR2 = httpsCallable<{ keys: string[] }, { urls: { key: string; url: string }[] }>(
    functions,
    "firmarUrlsR2"
  );
  const resultado: Record<string, string> = {};
  for (let i = 0; i < keys.length; i += MAX_POR_LOTE) {
    const lote = keys.slice(i, i + MAX_POR_LOTE);
    const { data } = await firmarUrlsR2({ keys: lote });
    data.urls.forEach(({ key, url }) => {
      resultado[key] = url;
      CACHE.set(key, { url, expiraEn: Date.now() + DURACION_MS });
    });
  }
  guardarCache();
  return resultado;
}

export function useSignedUrls(keys: (string | undefined | null)[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const keysLimpias = keys.filter((k): k is string => Boolean(k));
  const keysRef = useRef<string>("");
  const joined = keysLimpias.join(",");

  useEffect(() => {
    if (keysRef.current === joined) return;
    keysRef.current = joined;
    if (keysLimpias.length === 0) {
      setUrls({});
      return;
    }

    let cancelado = false;
    const ahora = Date.now();
    const frescas: Record<string, string> = {};
    const faltantes: string[] = [];

    keysLimpias.forEach((key) => {
      const cache = CACHE.get(key);
      if (cache && cache.expiraEn - MARGEN_MS > ahora) {
        frescas[key] = cache.url;
      } else {
        faltantes.push(key);
      }
    });

    setUrls((prev) => ({ ...prev, ...frescas }));

    if (faltantes.length > 0) {
      firmar(faltantes)
        .then((nuevas) => {
          if (!cancelado) setUrls((prev) => ({ ...prev, ...nuevas }));
        })
        .catch((error) => {
          console.error("No se pudieron firmar URLs de R2.", error);
        });
    }

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined]);

  return urls;
}
