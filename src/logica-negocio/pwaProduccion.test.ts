import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RAIZ = resolve(__dirname, "../..");
const leer = (f: string) => readFileSync(resolve(RAIZ, f), "utf-8");
const manifest = JSON.parse(leer("public/manifest.json"));
const sw = leer("public/sw.js");

describe("la PWA se actualiza sola tras publicar", () => {
  /**
   * El riesgo real de una PWA: que una version vieja quede atrapada en
   * cache y el usuario siga ejecutando codigo de hace semanas sin
   * enterarse. Vite inyecta un id por build en __VISTA360_BUILD__, que
   * entra en el NOMBRE de la cache: al cambiar, la anterior se borra.
   */
  it("el nombre de la cache lleva el id del build", () => {
    expect(sw).toContain('const BUILD = "__VISTA360_BUILD__";');
    expect(sw).toContain("const CACHE = `v360player-shell-${BUILD}`");
  });

  it("vite sustituye ese marcador en el artefacto final", () => {
    // Si el plugin desaparece, el marcador queda literal y TODAS las
    // versiones compartirian nombre de cache: la PWA no se actualizaria
    // nunca y el fallo seria invisible.
    expect(leer("vite.config.ts")).toContain("__VISTA360_BUILD__");
    expect(leer("vite.config.ts")).toContain("versionarServiceWorker");
  });

  it("al activar se borran las caches que no son la actual", () => {
    expect(sw).toContain("keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))");
  });

  it("la version nueva toma el control y avisa a las ventanas abiertas", () => {
    expect(sw).toContain("self.skipWaiting()");
    expect(sw).toContain("self.clients.claim()");
    expect(sw).toContain('cliente.postMessage({ tipo: "version-nueva" })');
    expect(leer("src/main.tsx")).toContain('evento.data?.tipo === "version-nueva"');
  });

  it("la recarga tiene guarda contra bucles", () => {
    // Sin esto, un fallo persistente recargaria la pagina sin parar.
    const lazy = leer("src/utils/pantallaLazy.ts");
    expect(lazy).toContain("VENTANA_MS = 30_000");
    expect(lazy).toContain("if (Date.now() - ultima < VENTANA_MS) return;");
  });
});

describe("la cache del service worker no puede filtrar datos entre usuarios", () => {
  it("NADA de otro origen se cachea", () => {
    // Las urls firmadas de R2 (facturas, fotos de campaña) son de otro
    // origen. Si se cachearan, en una computadora compartida el siguiente
    // usuario podria recuperar archivos privados del anterior.
    expect(sw).toContain("if (!mismoOrigen)");
    const rama = sw.slice(sw.indexOf("if (!mismoOrigen)"), sw.indexOf("const esAssetConHash"));
    expect(rama).toContain("event.respondWith(fetch(event.request))");
    expect(rama).not.toContain("cache.put");
  });

  it("solo se guarda el shell estatico", () => {
    expect(sw).toContain('const SHELL = ["/", "/index.html", "/manifest.json"];');
  });
});

describe("manifest listo para instalar", () => {
  it("tiene lo que exige la instalacion", () => {
    for (const campo of ["name", "short_name", "start_url", "scope", "display", "icons"]) {
      expect(manifest[campo], `falta ${campo}`).toBeTruthy();
    }
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    // Sin scope explicito el navegador lo deduce; declararlo evita que un
    // cambio de ubicacion del sw altere que rutas cuentan como la app.
    expect(manifest.scope).toBe("/");
  });

  it("los iconos son maskable, para que Android no los meta en un cuadro", () => {
    // Sin purpose maskable, Android dibuja el icono dentro de un cuadrado
    // blanco con borde en vez de usar la forma del sistema.
    const tamanos = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(tamanos).toContain("192x192");
    expect(tamanos).toContain("512x512");
    for (const icono of manifest.icons) {
      expect(icono.purpose, `icono ${icono.sizes} sin purpose`).toContain("maskable");
    }
  });
});
