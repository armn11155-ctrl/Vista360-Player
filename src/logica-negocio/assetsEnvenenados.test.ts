import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * EL FALLO QUE TUMBO EL PORTAL, y como se evita que vuelva.
 *
 * `_headers` marca /assets/* como "immutable, un año". Cloudflare Pages,
 * sin un 404.html, resuelve cualquier ruta desconocida devolviendo el
 * index.html con estado 200. Juntando las dos cosas: pedir una ruta de
 * /assets/ ANTES de que el despliegue la publique deja esa respuesta HTML
 * cacheada un año bajo la URL de un archivo .js.
 *
 * Cuando el archivo real aparecio, el borde siguio sirviendo el HTML. El
 * service worker detectaba el HTML y lanzaba -- correcto para no cachear
 * basura, pero la peticion moria como fallo de red y la aplicacion se
 * quedaba en negro, en escritorio Y en movil.
 *
 * Tres defensas, y esta prueba vigila las tres.
 */
const RAIZ = resolve(__dirname, "../..");
const leer = (f: string) => readFileSync(resolve(RAIZ, f), "utf-8");

describe("un asset envenenado no puede dejar la aplicación en negro", () => {
  it("1. existe 404.html, para que Pages deje de devolver el index como si fuera un asset", () => {
    // Es la defensa que cierra la ventana de envenenamiento.
    expect(existsSync(resolve(RAIZ, "public/404.html"))).toBe(true);
  });

  it("2. el service worker REINTENTA en vez de rendirse", () => {
    const sw = leer("public/sw.js");
    const bloque = sw.slice(sw.indexOf("const esAssetConHash"), sw.indexOf("// El shell (HTML"));
    // Detecta el veneno...
    expect(bloque).toContain('tipo.includes("text/html")');
    // ...y en vez de morir, pide de nuevo con un parámetro, que cambia la
    // clave de caché del borde y trae el archivo bueno del origen.
    expect(bloque).toContain('url.searchParams.set("reintento"');
    expect(bloque).toContain('cache: "reload"');
    // Y guarda el resultado bajo la URL ORIGINAL, para que la siguiente
    // carga no repita el rodeo: la aplicación se cura sola.
    expect(bloque).toContain("cache.put(event.request, copia2)");
  });

  it("2b. pero si el reintento tampoco trae JavaScript, falla en vez de servir basura", () => {
    // Curarse sola no puede significar tragarse cualquier cosa.
    const sw = leer("public/sw.js");
    const bloque = sw.slice(sw.indexOf("url.searchParams.set"), sw.indexOf("// El shell (HTML"));
    expect(bloque).toContain('tipo2.includes("text/html")');
    expect(bloque).toContain("throw new Error");
  });

  it("3. los trozos no llevan nombres que un bloqueador pueda filtrar", () => {
    // Se llamaban vendor-firebase-firestore, vendor-firebase-auth... Un
    // cliente con uBlock y una regla contra "firebase" ve la aplicación en
    // blanco, y esa es una llamada a soporte que no se diagnostica nunca.
    const vite = leer("vite.config.ts");
    const chunks = vite.slice(vite.indexOf("manualChunks(id)"), vite.indexOf("manualChunks(id)") + 900);
    expect(chunks).not.toMatch(/return "vendor-firebase/);
    expect(chunks).toContain('return "nucleo-datos"');
    expect(chunks).toContain('return "nucleo-sesion"');
  });

  it("4. /assets/* sigue siendo immutable, que es correcto y no se toca", () => {
    // El problema nunca fue cachear los assets con hash: eso está bien y
    // es lo que hace rápida la aplicación. El problema era QUÉ se cacheaba
    // cuando el archivo no existía todavía.
    const headers = leer("public/_headers");
    expect(headers).toContain("/assets/*");
    expect(headers).toMatch(/max-age=31536000, immutable/);
  });
});
