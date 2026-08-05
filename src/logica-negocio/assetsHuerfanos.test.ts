import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Evita que se acumulen imágenes que nadie usa.
 *
 * Se habían juntado 5,7 MB de fondos de versiones anteriores del diseño
 * -- entre ellos dos de 1,5 MB cada uno. No los descargaba nadie (no
 * estaban referenciados), pero engordaban el repositorio y cada
 * despliegue, y confundían: nadie se atrevía a borrarlos por si acaso.
 *
 * Este test recorre public/ y comprueba que cada imagen esté
 * referenciada en alguna parte del código.
 */

const RAIZ = resolve(__dirname, "../..");
const EXTENSIONES = /\.(png|jpe?g|webp|svg|ico|gif)$/i;

/** Todo el código donde puede aparecer la referencia a un asset. */
function codigoCompleto(): string {
  let texto = "";
  const recorrer = (dir: string) => {
    for (const nombre of readdirSync(dir)) {
      const ruta = resolve(dir, nombre);
      if (statSync(ruta).isDirectory()) {
        if (nombre !== "node_modules") recorrer(ruta);
        continue;
      }
      // OJO: hay que incluir functions/ -- las imágenes del correo se
      // referencian SOLO desde el backend. Sin esto, el test las daría
      // por huérfanas y alguien las borraría, dejando el correo con
      // imágenes rotas.
      if (/\.(ts|tsx|css|mjs|js|html|json)$/.test(nombre)) {
        texto += readFileSync(ruta, "utf-8");
      }
    }
  };
  for (const base of ["src", "functions/src", "scripts"]) recorrer(resolve(RAIZ, base));
  for (const suelto of ["index.html", "public/manifest.json", "public/sw.js"]) {
    texto += readFileSync(resolve(RAIZ, suelto), "utf-8");
  }
  return texto;
}

const CODIGO = codigoCompleto();

/**
 * ¿Se usa este archivo? Contempla los nombres CONSTRUIDOS, como
 * `/campaign-city-${ciudad}.webp`: ahí el nombre completo no aparece
 * literalmente en ninguna parte, y una comprobación ingenua los daría
 * por huérfanos.
 */
function seUsa(nombre: string): boolean {
  const base = nombre.replace(EXTENSIONES, "");
  if (CODIGO.includes(nombre) || CODIGO.includes(base)) return true;
  for (const m of CODIGO.matchAll(/[`"']\/?([a-z0-9-]*)\$\{[^}]+\}([a-z0-9.-]*)[`"']/gi)) {
    const [, prefijo, sufijo] = m;
    if (prefijo && nombre.startsWith(prefijo) && nombre.endsWith(sufijo)) return true;
  }
  return false;
}

describe("public/ no acumula imágenes que nadie usa", () => {
  const imagenes = readdirSync(resolve(RAIZ, "public")).filter((f) => EXTENSIONES.test(f));

  it("hay imágenes que revisar (si no, el test no valdría nada)", () => {
    expect(imagenes.length).toBeGreaterThan(10);
  });

  it("todas las imágenes están referenciadas en alguna parte", () => {
    const huerfanas = imagenes.filter((f) => !seUsa(f));
    expect(huerfanas).toEqual([]);
  });

  it("las imágenes del correo (que solo usa el backend) NO se dan por huérfanas", () => {
    // Protege contra el error de escanear solo src/: esas tres se
    // referencian únicamente desde functions/.
    for (const n of ["vista360-correo-glow.png", "vista360-correo-glow-bl.png", "vista360-logo-correo-blanco.png"]) {
      expect(seUsa(n), n).toBe(true);
    }
  });

  it("las fotos de ciudad con nombre construido tampoco", () => {
    for (const n of ["campaign-city-rio.webp", "campaign-city-new-york-hero.webp"]) {
      expect(seUsa(n), n).toBe(true);
    }
  });

  it("ninguna imagen suelta pasa de 1 MB", () => {
    // Un fondo de 1,5 MB tarda en cargar con datos móviles, que es como
    // usan la app la mayoría de clientes.
    const pesadas = imagenes
      .map((f) => ({ f, kb: Math.round(statSync(resolve(RAIZ, "public", f)).size / 1024) }))
      .filter((x) => x.kb > 1024);
    expect(pesadas).toEqual([]);
  });
});
