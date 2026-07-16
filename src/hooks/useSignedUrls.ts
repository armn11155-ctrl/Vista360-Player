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

const CACHE = new Map<string, { url: string; expiraEn: number }>();
const MARGEN_MS = 30 * 60 * 1000; // renovar 30 min antes de expirar
const DURACION_MS = 6 * 60 * 60 * 1000;
const MAX_POR_LOTE = 60;

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
