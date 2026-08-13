import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * EL FALLO QUE ESTO HABRIA ATRAPADO.
 *
 * Había DOS visores de PDF: `visor-pdf.html` (entrada dedicada, ligera, la
 * que de verdad se abre) y un componente React `VisorPdf.tsx` colgado de
 * `main.tsx` tras `?visor-pdf`.
 *
 * `descargarArchivo` abre el HTML estático directamente. El parametro
 * `visor-pdf` no lo generaba NADIE, así que el componente nunca se
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
    const rutas = [...abridor.matchAll(/["'`]\/([\w.-]+\.html)["'`]/g)].map((m) => m[1]);
    expect(rutas.length, "descargarArchivo debe abrir alguna ruta de visor").toBeGreaterThan(0);
    for (const ruta of rutas) {
      expect(existsSync(resolve(RAIZ, ruta)), `falta ${ruta}`).toBe(true);
    }
  });

  it("no envía URL, firma ni token en la barra", () => {
    const visor = leer("src/visor-pdf.ts");
    expect(abridor).not.toMatch(/\/visor-pdf\.html\?/);
    expect(visor).not.toContain("URLSearchParams");
    expect(visor).toContain('history.replaceState(null, "", "/")');
  });

  it("la clave de sessionStorage coincide entre quien escribe y quien lee", () => {
    // Si los prefijos se separan, el visor abre siempre "no se pudo abrir".
    const visor = leer("src/visor-pdf.ts");
    expect(abridor).toContain('"vista360:visor-pdf"');
    expect(visor).toContain('"vista360:visor-pdf"');
  });

  it("no existe ningún token copiable o adivinable", () => {
    expect(abridor).not.toContain("crypto.randomUUID()");
    expect(abridor).not.toContain("?token=");
  });

  it("el visor BORRA la entrada al leerla: un solo uso", () => {
    // La URL con el token puede quedar en el historial o en una captura.
    // Si la entrada siguiera ahi, reabrirla mostraria el documento otra vez.
    const visor = leer("src/visor-pdf.ts");
    expect(visor).toContain("sessionStorage.removeItem(CLAVE_VISOR)");
  });

  it("mantiene la URL propia mientras PDF.js pinta cada página", () => {
    const visor = leer("src/visor-pdf.ts");
    expect(visor).toContain('document.createElement("canvas")');
    expect(visor).toContain("pagina.render({");
    expect(visor).toContain('history.replaceState(null, "", "/")');
    expect(visor).not.toContain("<embed");
    expect(visor).not.toContain("<iframe");
  });

  it("no queda un segundo visor en React compitiendo con el estático", () => {
    expect(existsSync(resolve(RAIZ, "src/components/VisorPdf.tsx"))).toBe(false);
    expect(leer("src/main.tsx")).not.toContain("VisorPdf");
  });
});
