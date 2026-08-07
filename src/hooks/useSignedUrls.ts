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

function frescasDesdeCache(keys: string[]): Record<string, string> {
  const resultado: Record<string, string> = {};
  const ahora = Date.now();
  keys.forEach((key) => {
    const cache = CACHE.get(key);
    if (cache && cache.expiraEn - MARGEN_MS > ahora) resultado[key] = cache.url;
  });
  return resultado;
}

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

/**
 * AGRUPADOR DE PETICIONES SIMULTÁNEAS.
 *
 * El problema que resuelve: las tarjetas piden su URL una a una. En la
 * pantalla de Facturas se dibuja una FacturaCard por factura, y cada una
 * llamaba a firmarUrlsR2 por su cuenta -- con 20 facturas en pantalla,
 * 20 llamadas a Cloud Functions para pedir 20 claves que caben de sobra
 * en UNA sola (el tope es 60 por llamada).
 *
 * Y no es solo el número de invocaciones: firmarUrlsR2 consulta los
 * contratos del cliente en cada llamada para comprobar de quién es cada
 * archivo. 20 llamadas eran 20 consultas a Firestore para responder
 * exactamente lo mismo.
 *
 * Cómo funciona: en vez de pedir de inmediato, cada solicitud deja sus
 * claves en una cola y espera un instante (20 ms). Todo lo que pida en
 * esa ventana viaja junto en una sola llamada. 20 ms no se notan -- es
 * menos de lo que tarda en dibujarse la lista -- y las tarjetas montan
 * todas en el mismo ciclo de render, así que en la práctica siempre caen
 * en la misma ventana.
 *
 * Además, si dos componentes piden la MISMA clave a la vez, comparten la
 * misma llamada en vez de duplicarla: la promesa del lote es una sola.
 */
const VENTANA_AGRUPADO_MS = 20;

let colaDeClaves = new Set<string>();
let promesaDelLote: Promise<void> | null = null;

function pedirFirmaAgrupada(keys: string[]): Promise<void> {
  keys.forEach((k) => colaDeClaves.add(k));

  if (!promesaDelLote) {
    promesaDelLote = new Promise<void>((resolve) => {
      setTimeout(async () => {
        const lote = Array.from(colaDeClaves);
        // Se limpia ANTES de la llamada: si mientras se firma este lote
        // llegan claves nuevas, arrancan su propia cola en vez de
        // colarse en una petición que ya salió.
        colaDeClaves = new Set();
        promesaDelLote = null;
        try {
          await firmar(lote);
        } catch (error) {
          console.error("No se pudieron firmar URLs de R2.", error);
        }
        resolve();
      }, VENTANA_AGRUPADO_MS);
    });
  }

  return promesaDelLote;
}

export function useSignedUrls(keys: (string | undefined | null)[]): Record<string, string> {
  const keysLimpias = keys.filter((k): k is string => Boolean(k));
  // En un remonte (el caso Cambiar cliente -> Gestión), las firmas de 6h
  // ya están en CACHE. Publicarlas desde el inicializador evita incluso el
  // render intermedio vacío que antes hacía reaparecer el loader.
  const [urls, setUrls] = useState<Record<string, string>>(() => frescasDesdeCache(keysLimpias));
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
    const frescas = frescasDesdeCache(keysLimpias);
    const faltantes: string[] = [];

    keysLimpias.forEach((key) => {
      if (!(key in frescas)) faltantes.push(key);
    });

    setUrls((prev) => ({ ...prev, ...frescas }));

    if (faltantes.length > 0) {
      // Se piden agrupadas con las de los demás componentes que estén
      // montando al mismo tiempo (ver pedirFirmaAgrupada). Cuando el
      // lote termina, las URLs ya están en CACHE: se leen de ahí, así
      // que da igual si las firmó esta llamada o la de otra tarjeta.
      void pedirFirmaAgrupada(faltantes).then(() => {
        if (cancelado) return;
        const recien: Record<string, string> = {};
        faltantes.forEach((key) => {
          const enCache = CACHE.get(key);
          if (enCache) recien[key] = enCache.url;
        });
        if (Object.keys(recien).length > 0) setUrls((prev) => ({ ...prev, ...recien }));
      });
    }

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined]);

  return urls;
}
