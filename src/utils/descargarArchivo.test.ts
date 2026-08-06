import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { descargarArchivo, verArchivo } from "./descargarArchivo";

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

/**
 * La hoja del sistema SOLO debe salir en iOS. Chrome en macOS tambien
 * soporta navigator.share con archivos, y en produccion eso hacia que
 * "Descargar" abriera AirDrop/Mail en vez de bajar el PDF -- y la hoja de
 * macOS no trae "Guardar en Archivos", asi que no habia forma de
 * descargarlo. Por eso los agentes de usuario son parte de la prueba.
 */
const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";
const UA_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const UA_IPAD_MODERNO = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/604.1";

describe("en el móvil se usa la hoja del sistema", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:local/abc");
    URL.revokeObjectURL = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob(["pdf"]), { status: 200 })));
  });
  afterEach(() => vi.restoreAllMocks());

  it("si el sistema puede compartir archivos, se ofrece 'Guardar en Archivos'", async () => {
    // Safari en iOS abre los PDF en su visor pase lo que pase: ni con
    // blob ni con Content-Disposition los guarda. La hoja del sistema es
    // lo ÚNICO que de verdad los guarda ahí.
    const share = vi.fn(async (_datos: { files: File[]; title?: string }) => undefined);
    vi.stubGlobal("navigator", { share, canShare: () => true, userAgent: UA_IPHONE, maxTouchPoints: 5 });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await descargarArchivo("https://x/y.pdf", "Reporte.pdf");
    expect(share).toHaveBeenCalled();
    expect(share.mock.calls[0]![0].files[0]!.name).toBe("Reporte.pdf");
    // Y NO se intenta además la descarga por enlace.
    expect(click).not.toHaveBeenCalled();
  });

  it("en una Mac de ESCRITORIO se descarga, no se abre la hoja", async () => {
    // Comprobado en produccion: Chrome en macOS soporta canShare con
    // archivos, asi que "Descargar" abria AirDrop/Mail y el boton se
    // quedaba en "Descargando..." para siempre. La hoja de macOS no trae
    // "Guardar en Archivos": no habia forma de obtener el PDF.
    const share = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { share, canShare: () => true, userAgent: UA_MAC, maxTouchPoints: 0 });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await descargarArchivo("https://x/y.pdf", "Factura 05 Ago 2026.pdf");
    expect(share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
  });

  it("un iPad moderno SI usa la hoja, aunque diga que es un Mac", async () => {
    // iPadOS 13+ se hace pasar por Mac; solo se delata por el tactil.
    const share = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { share, canShare: () => true, userAgent: UA_IPAD_MODERNO, maxTouchPoints: 5 });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await descargarArchivo("https://x/y.pdf", "a.pdf");
    expect(share).toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it("si la persona CANCELA la hoja, no se descarga nada por su cuenta", async () => {
    // Cancelar es una decisión suya, no un fallo que haya que arreglar.
    const abortar = Object.assign(new Error("cancelado"), { name: "AbortError" });
    vi.stubGlobal("navigator", { share: vi.fn(async () => { throw abortar; }), canShare: () => true, userAgent: UA_IPHONE, maxTouchPoints: 5 });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const abrir = vi.fn();
    vi.stubGlobal("open", abrir);
    await descargarArchivo("https://x/y.pdf", "a.pdf");
    expect(click).not.toHaveBeenCalled();
    expect(abrir).not.toHaveBeenCalled();
  });

  it("en escritorio (sin hoja) se descarga por enlace, como siempre", async () => {
    vi.stubGlobal("navigator", {});
    let clicado: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicado = this;
    });
    await descargarArchivo("https://x/y.pdf", "a.pdf");
    expect(clicado).not.toBeNull();
    expect(clicado!.download).toBe("a.pdf");
  });
});

describe("ver un PDF no enseña la dirección de R2", () => {
  afterEach(() => vi.restoreAllMocks());

  it("pide foco inmediatamente para que Safari lleve a la pestaña nueva", async () => {
    const eventos: string[] = [];
    const ventana = {
      closed: false,
      opener: {},
      focus: vi.fn(() => eventos.push("focus")),
      document: {
        write: vi.fn(),
        close: vi.fn(),
        open: vi.fn(),
      },
      location: { href: "" },
    };
    vi.stubGlobal("open", vi.fn(() => {
      eventos.push("open");
      return ventana;
    }));
    vi.stubGlobal("fetch", vi.fn(async () => {
      eventos.push("fetch");
      return new Response(new Blob(["pdf"]), { status: 200 });
    }));
    URL.createObjectURL = vi.fn(() => "blob:https://vista360player.pe/abc");
    URL.revokeObjectURL = vi.fn();

    await verArchivo("https://algo.r2/x.pdf", "Reporte.pdf");

    expect(eventos.slice(0, 3)).toEqual(["open", "focus", "fetch"]);
    expect(ventana.focus).toHaveBeenCalledTimes(2);
  });

  it("abre la pestaña ANTES de esperar, o el navegador la bloquea", () => {
    // Si se abriera después del await, el navegador ya no lo considera
    // una acción de la persona y lo trata como publicidad.
    const fuente = readFileSync(resolve(__dirname, "descargarArchivo.ts"), "utf-8");
    const cuerpo = fuente.slice(fuente.indexOf("export async function verArchivo"));
    expect(cuerpo.indexOf("window.open")).toBeLessThan(cuerpo.indexOf("await fetch"));
  });

  it("carga el PDF como blob, bajo el dominio propio", async () => {
    URL.createObjectURL = vi.fn(() => "blob:https://vista360player.pe/abc");
    URL.revokeObjectURL = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob(["pdf"]), { status: 200 })));
    const ventana = { closed: false, location: { href: "" } };
    vi.stubGlobal("open", vi.fn(() => ventana));
    await verArchivo("https://algo.r2.cloudflarestorage.com/x.pdf?X-Amz-Signature=abc", "x.pdf");
    expect(ventana.location.href).toContain("blob:");
    expect(ventana.location.href).not.toContain("r2.cloudflarestorage.com");
  });

  it("si no se puede, cae al enlace directo en la MISMA pestaña ya abierta", async () => {
    // Peor presentación, pero el PDF se ve igual. Nunca un botón muerto.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("CORS"); }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ventana = { closed: false, location: { href: "" } };
    vi.stubGlobal("open", vi.fn(() => ventana));
    await verArchivo("https://algo.r2/x.pdf", "x.pdf");
    expect(ventana.location.href).toBe("https://algo.r2/x.pdf");
  });
});

describe("las tarjetas usan las funciones nuevas también para Ver", () => {
  const leer = (p: string) => readFileSync(resolve(__dirname, p), "utf-8");
  for (const archivo of ["../components/ReportCard.tsx", "../components/FacturaCard.tsx"]) {
    it(`${archivo.split("/").pop()} ya no enlaza directo a la URL firmada`, () => {
      const codigo = leer(archivo);
      expect(codigo).toContain("verArchivo(");
      expect(codigo).not.toMatch(/<a[^>]*href=\{url(Ver)?\}[^>]*target="_blank"/);
    });
  }
});
