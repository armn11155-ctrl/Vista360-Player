import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { descargarArchivo } from "./descargarArchivo";

/**
 * El botón "Descargar" no descargaba en el móvil.
 *
 * Era un `<a href={urlDeR2} download>`, y el atributo `download` SE
 * IGNORA cuando el enlace apunta a otro dominio -- la app está en
 * vista360player.pe y los PDFs en *.r2.cloudflarestorage.com. El enlace
 * simplemente navegaba al PDF y el visor del sistema lo abría: para la
 * persona, idéntico a pulsar "Ver".
 */

describe("descarga de archivos", () => {
  let clicado: HTMLAnchorElement | null = null;

  beforeEach(() => {
    clicado = null;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicado = this;
    });
    // jsdom no implementa estas dos.
    URL.createObjectURL = vi.fn(() => "blob:local/abc");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it("descarga por blob, que SÍ es del mismo origen", async () => {
    // Es lo único que hace que `download` funcione en el móvil.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob(["pdf"]), { status: 200 })));
    await descargarArchivo("https://algo.r2.cloudflarestorage.com/x.pdf", "Reporte.pdf");
    expect(clicado).not.toBeNull();
    expect(clicado!.href).toContain("blob:");
    expect(clicado!.download).toBe("Reporte.pdf");
  });

  it("limpia los caracteres prohibidos del nombre", () => {
    // Con `/` o `:` dentro, algunos navegadores descartan el `download`
    // entero y vuelven a ABRIR el archivo en vez de guardarlo.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob(["pdf"]), { status: 200 })));
    return descargarArchivo("https://x/y.pdf", 'Factura 01/2026: "final".pdf').then(() => {
      expect(clicado!.download).not.toMatch(/[\\/:*?"<>|]/);
      expect(clicado!.download).toContain("Factura 01-2026");
    });
  });

  it("si el archivo no se puede traer, lo ABRE como antes", async () => {
    // Nunca peor que antes: una conexión mala no puede dejar un botón
    // muerto.
    const abrir = vi.fn();
    vi.stubGlobal("open", abrir);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("CORS"); }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await descargarArchivo("https://x/y.pdf", "a.pdf");
    expect(abrir).toHaveBeenCalledWith("https://x/y.pdf", "_blank", "noopener");
    expect(clicado).toBeNull();
  });

  it("un 403 también cae al respaldo", async () => {
    const abrir = vi.fn();
    vi.stubGlobal("open", abrir);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 403 })));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await descargarArchivo("https://x/y.pdf", "a.pdf");
    expect(abrir).toHaveBeenCalled();
  });

  it("no hace nada sin URL", async () => {
    const abrir = vi.fn();
    vi.stubGlobal("open", abrir);
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await descargarArchivo("", "a.pdf");
    expect(f).not.toHaveBeenCalled();
    expect(abrir).not.toHaveBeenCalled();
  });

  it("tiene tope de espera: no deja el botón parado para siempre", () => {
    const fuente = readFileSync(resolve(__dirname, "descargarArchivo.ts"), "utf-8");
    expect(fuente).toContain("AbortController");
    expect(fuente).toMatch(/ESPERA_MAXIMA_MS = [\d_]+/);
  });
});

describe("los botones usan la descarga nueva", () => {
  const leer = (p: string) => readFileSync(resolve(__dirname, p), "utf-8");

  for (const archivo of ["../components/ReportCard.tsx", "../components/FacturaCard.tsx"]) {
    it(`${archivo.split("/").pop()} ya no usa <a download>`, () => {
      const codigo = leer(archivo);
      expect(codigo).toContain("descargarArchivo(");
      // El patrón viejo: un ancla con `download` a una URL de otro dominio.
      expect(codigo).not.toMatch(/href=\{[^}]*urlDescarga[^}]*\}\s*\n\s*download/);
    });

    it(`${archivo.split("/").pop()} avisa mientras descarga`, () => {
      // En el móvil la espera se nota; sin aviso parece que no hizo nada.
      expect(leer(archivo)).toContain("Descargando…");
    });
  }
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
