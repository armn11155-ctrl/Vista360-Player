import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * LA NAVEGACIÓN NO PUEDE MORIR EN SILENCIO.
 *
 * setView() cambia de pantalla dentro de un startTransition, y React no
 * cambia nada hasta tener el código de la pantalla nueva. Cada pantalla
 * es un .js aparte cuyo nombre cambia con cada despliegue. Si ese código
 * no llega -- una pestaña abierta desde antes del despliegue, una copia
 * envenenada en la caché del Service Worker -- React se queda mostrando
 * la pantalla anterior: sin error, sin aviso, sin nada en la consola.
 *
 * Se pulsa "Campañas" y no pasa absolutamente nada. Pasó de verdad, y
 * costó horas encontrarlo justamente porque no deja rastro.
 */

const raiz = resolve(__dirname, "../..");
const app = readFileSync(resolve(__dirname, "../App.tsx"), "utf-8");
const helper = readFileSync(resolve(__dirname, "../utils/pantallaLazy.ts"), "utf-8");
const main = readFileSync(resolve(__dirname, "../main.tsx"), "utf-8");
const sw = readFileSync(resolve(raiz, "public/sw.js"), "utf-8");

describe("todas las pantallas se cargan con recuperación", () => {
  it("NINGUNA usa lazy() pelado", () => {
    // Un lazy() sin recuperación es una pantalla que puede volverse
    // inalcanzable para siempre tras un despliegue.
    expect(app).not.toMatch(/[^a-zA-Z]lazy\(\(\) => import\(/);
  });

  it("todas usan pantallaLazy", () => {
    const cuantas = (app.match(/pantallaLazy\(\(\) => import\(/g) ?? []).length;
    expect(cuantas).toBeGreaterThanOrEqual(15);
  });
});

describe("qué hace pantallaLazy cuando la carga falla", () => {
  it("limpia la caché del Service Worker antes de reintentar", () => {
    // Reintentar sin limpiar vuelve a leer la misma copia envenenada.
    // Se mira SOLO el trozo entre el primer fallo y el reintento: la
    // definicion de la funcion tambien contiene ese nombre y colarse ahi
    // haria pasar el test sin que se llamara a nada.
    const desde = helper.indexOf("catch (primerFallo)");
    const hasta = helper.lastIndexOf("return await cargar()");
    expect(desde).toBeGreaterThan(-1);
    expect(hasta).toBeGreaterThan(desde);
    expect(helper.slice(desde, hasta)).toContain("await limpiarCacheDelServiceWorker();");
  });

  it("reintenta UNA vez y luego recarga la página", () => {
    expect((helper.match(/await cargar\(\)/g) ?? []).length).toBe(2);
    expect(helper).toContain("recargarPorVersionDesactualizada()");
  });

  it("espera a que el Service Worker confirme, pero no para siempre", () => {
    expect(helper).toContain("canal.port1.onmessage");
    expect(helper).toMatch(/setTimeout\(resolver, \d+\)/);
  });
});

describe("el guard de recarga no puede dejar la app atascada", () => {
  it("es por TIEMPO, no de una sola vez", () => {
    // Antes era una marca en sessionStorage que no se borraba nunca: si
    // la primera recarga no bastaba, quedaba puesta para toda la sesión
    // y no se reintentaba NUNCA. Así se llega a una app que solo
    // funciona en la pantalla que ya tenía cargada.
    expect(helper).toContain("VENTANA_MS");
    expect(helper).toMatch(/Date\.now\(\) - ultima < VENTANA_MS/);
    expect(helper).not.toMatch(/if \(sessionStorage\.getItem\([A-Z_]+\)\) return;/);
  });

  it("main.tsx usa ese mismo guard, no uno propio", () => {
    expect(main).toContain('from "./utils/pantallaLazy"');
    expect(main).not.toContain("function recargarPorVersionDesactualizada()");
  });

  it("sigue enganchado a los dos eventos que detectan chunks viejos", () => {
    expect(main).toContain('"vite:preloadError"');
    expect(main).toContain('el.tagName !== "SCRIPT" && el.tagName !== "LINK"');
  });
});

describe("el Service Worker confirma cuando terminó de limpiar", () => {
  it("contesta por el puerto que le mandan", () => {
    // Sin respuesta, quien limpia no sabe cuándo terminó y reintenta
    // sobre la caché vieja.
    expect(sw).toContain("event.ports[0].postMessage");
  });

  it("la versión de la caché subió (fuerza renovación en los clientes)", () => {
    const v = /const CACHE = "v360player-shell-v(\d+)"/.exec(sw);
    expect(v).not.toBeNull();
    expect(Number(v![1])).toBeGreaterThanOrEqual(10);
  });
});
