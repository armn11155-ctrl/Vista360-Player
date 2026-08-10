import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * EL FALLO QUE ESTO HABRIA ATRAPADO.
 *
 * Habia DOS visores de PDF: `public/visor-pdf.html` (estatico, ligero, el
 * que de verdad se abre) y un componente React `VisorPdf.tsx` colgado de
 * `main.tsx` tras `?visor-pdf`.
 *
 * Pero `descargarArchivo` abre `/visor-pdf.html?token=...`. El parametro
 * `visor-pdf` no lo generaba NADIE, asi que el componente nunca se
 * renderizaba: 122 lineas muertas que ademas viajaban en el bundle
 * principal de todos los usuarios por ser un import estatico.
 *
 * Lo peligroso no era el peso: era que alguien mañana arreglara un bug
 * del visor en el archivo equivocado y no entendiera por que no cambia
 * nada en produccion.
 */
const RAIZ = resolve(__dirname, "../..");
const leer = (f: string) => readFileSync(resolve(RAIZ, f), "utf-8");

describe("la ruta del visor de PDF apunta a algo que existe", () => {
  const abridor = leer("src/utils/descargarArchivo.ts");

  it("la ruta que se abre corresponde a un archivo real", () => {
    const rutas = [...abridor.matchAll(/["'`]\/([\w.-]+\.html)\?/g)].map((m) => m[1]);
    expect(rutas.length, "descargarArchivo debe abrir alguna ruta de visor").toBeGreaterThan(0);
    for (const ruta of rutas) {
      expect(existsSync(resolve(RAIZ, `public/${ruta}`)), `falta public/${ruta}`).toBe(true);
    }
  });

  it("el parámetro que se envía es el que el visor lee", () => {
    // El desajuste exacto que dejo el componente muerto.
    const enviado = abridor.match(/\/[\w.-]+\.html\?(\w+)=/)?.[1];
    expect(enviado).toBeDefined();
    const visor = leer("public/visor-pdf.html");
    expect(visor).toContain(`get("${enviado}")`);
  });

  it("la clave de sessionStorage coincide entre quien escribe y quien lee", () => {
    // Si los prefijos se separan, el visor abre siempre "no se pudo abrir".
    const visor = leer("public/visor-pdf.html");
    expect(abridor).toContain("vista360:visor-pdf:");
    expect(visor).toContain("vista360:visor-pdf:");
  });

  it("el token es imposible de adivinar", () => {
    // El token viaja en la URL; si fuera secuencial o predecible, otra
    // pestaña del mismo origen podria leer el documento de alguien.
    expect(abridor).toContain("crypto.randomUUID()");
  });

  it("el visor BORRA la entrada al leerla: un solo uso", () => {
    // La URL con el token puede quedar en el historial o en una captura.
    // Si la entrada siguiera ahi, reabrirla mostraria el documento otra vez.
    const visor = leer("public/visor-pdf.html");
    expect(visor).toContain("sessionStorage.removeItem(clave)");
  });

  it("no queda un segundo visor en React compitiendo con el estático", () => {
    expect(existsSync(resolve(RAIZ, "src/components/VisorPdf.tsx"))).toBe(false);
    expect(leer("src/main.tsx")).not.toContain("VisorPdf");
  });
});
