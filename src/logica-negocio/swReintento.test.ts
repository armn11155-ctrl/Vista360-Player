import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

/**
 * Esta prueba EJECUTA el service worker, no lo lee.
 *
 * La primera versión solo comprobaba que el código del reintento
 * estuviera escrito. Un mutante que metía un `throw` justo antes -- código
 * presente pero inalcanzable -- la pasaba entera. Comprobar que una
 * defensa está escrita no es comprobar que funciona.
 */
const SW = readFileSync(resolve(__dirname, "../../public/sw.js"), "utf-8");

/** Respuesta mínima, suficiente para lo que mira el service worker. */
function respuesta(tipo: string, cuerpo: string, ok = true) {
  return {
    ok,
    status: ok ? 200 : 404,
    headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? tipo : null) },
    clone() {
      return respuesta(tipo, cuerpo, ok);
    },
    cuerpo,
  };
}

/**
 * Arranca el service worker en un contexto aislado y devuelve su
 * manejador de `fetch` junto con lo que se guardó en caché.
 */
function arrancarSw(respuestasPorUrl: (url: string) => unknown) {
  const manejadores: Record<string, (e: unknown) => void> = {};
  const guardado: Array<{ clave: unknown }> = [];
  const contexto: Record<string, unknown> = {
    self: {
      addEventListener: (nombre: string, fn: (e: unknown) => void) => {
        manejadores[nombre] = fn;
      },
      registration: { scope: "https://vista360player.pe/" },
      clients: { claim: () => Promise.resolve(), matchAll: () => Promise.resolve([]) },
      skipWaiting: () => {},
      location: { origin: "https://vista360player.pe" },
    },
    caches: {
      match: () => Promise.resolve(undefined),
      open: () =>
        Promise.resolve({
          put: (clave: unknown) => {
            guardado.push({ clave });
            return Promise.resolve();
          },
          addAll: () => Promise.resolve(),
        }),
      keys: () => Promise.resolve([]),
      delete: () => Promise.resolve(true),
    },
    fetch: (entrada: unknown) => {
      const url = typeof entrada === "string" ? entrada : (entrada as { url: string }).url;
      return Promise.resolve(respuestasPorUrl(url));
    },
    URL,
    Date,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout,
    clearTimeout,
    Promise,
    Error,
    location: { origin: "https://vista360player.pe" },
  };
  contexto.globalThis = contexto;
  runInNewContext(SW, contexto);
  return { manejadores, guardado };
}

/** Simula una petición de un asset y devuelve lo que responde el sw. */
async function pedirAsset(respuestasPorUrl: (url: string) => unknown) {
  const { manejadores, guardado } = arrancarSw(respuestasPorUrl);
  expect(manejadores.fetch, "el sw debe registrar un manejador de fetch").toBeDefined();

  let respondido: Promise<unknown> | undefined;
  const evento = {
    request: {
      url: "https://vista360player.pe/assets/nucleo-datos-D2gpNjOX.js",
      method: "GET",
      mode: "cors",
      destination: "script",
      headers: { get: () => null },
    },
    respondWith: (p: Promise<unknown>) => {
      respondido = p;
    },
    waitUntil: () => {},
  };
  manejadores.fetch(evento);
  return { respondido, guardado };
}

describe("el service worker se cura solo cuando el borde devuelve HTML", () => {
  it("reintenta y ENTREGA el JavaScript bueno", async () => {
    // Es el escenario real: la URL limpia trae HTML envenenado; la misma
    // con un parámetro trae el archivo de verdad desde el origen.
    const { respondido } = await pedirAsset((url) =>
      url.includes("reintento")
        ? respuesta("application/javascript", "export const ok=1")
        : respuesta("text/html", "<!doctype html>")
    );
    const res = (await respondido) as { cuerpo: string };
    expect(res.cuerpo).toBe("export const ok=1");
  });

  it("guarda el resultado bajo la URL SIN parámetro, para no repetir el rodeo", async () => {
    const { respondido, guardado } = await pedirAsset((url) =>
      url.includes("reintento")
        ? respuesta("application/javascript", "export const ok=1")
        : respuesta("text/html", "<!doctype html>")
    );
    await respondido;
    await new Promise((r) => setTimeout(r, 0));
    const claves = guardado.map((g) =>
      typeof g.clave === "string" ? g.clave : (g.clave as { url: string }).url
    );
    expect(claves.length).toBeGreaterThan(0);
    expect(claves.every((c) => !c.includes("reintento"))).toBe(true);
  });

  it("si el reintento TAMBIÉN trae HTML, falla en vez de servir basura", async () => {
    const { respondido } = await pedirAsset(() => respuesta("text/html", "<!doctype html>"));
    await expect(respondido).rejects.toThrow();
  });

  it("cuando la respuesta ya es correcta, no da ningún rodeo", async () => {
    const pedidas: string[] = [];
    const { respondido } = await pedirAsset((url) => {
      pedidas.push(url);
      return respuesta("application/javascript", "export const ok=1");
    });
    await respondido;
    expect(pedidas.some((u) => u.includes("reintento"))).toBe(false);
    expect(pedidas.length).toBe(1);
  });
});
