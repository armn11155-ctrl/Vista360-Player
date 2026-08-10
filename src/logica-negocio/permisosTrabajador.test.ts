import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RAIZ = resolve(__dirname, "../..");
const leer = (f: string) => readFileSync(resolve(RAIZ, f), "utf-8");
const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

/** Las mismas formas que exige obtenerArchivoR2Base64. */
const FORMATO_REPORTE =
  /^clientes\/([A-Za-z0-9_-]{1,128})\/reportes\/\d{4}-\d{2}\/\d{2}\/[A-Za-z0-9_-]{1,60}\.pdf$/;
const FORMATO_FACTURA = /^vista360\/facturas\/[A-Za-z0-9._-]{1,80}$/;
const aceptada = (k: string) => FORMATO_REPORTE.test(k) || FORMATO_FACTURA.test(k);

describe("el Trabajador puede enviar por Correo y WhatsApp", () => {
  const fn = sinComentarios(leer("functions/src/obtenerArchivoR2Base64.ts"));

  it("obtenerArchivoR2Base64 acepta al personal interno, no solo al Gerente", () => {
    expect(fn).toContain("esPersonalInterno(propio.data()?.role)");
    expect(fn).not.toMatch(/role\s*!==\s*"admin"/);
  });

  it("pero NO se convierte en una puerta abierta a R2", () => {
    // Minimo privilegio: la key debe ser un recurso REAL, no un prefijo.
    expect(fn).toContain("FORMATO_REPORTE.exec(key)");
    expect(fn).toContain("FORMATO_FACTURA.test(key)");
    expect(fn).toContain("esKeyValida(key)");
    // Reporte: el cliente de la ruta tiene que existir.
    expect(fn).toContain("db.doc(`clientes/${clienteIdDeLaRuta}`).get()");
    // Factura: tiene que haber una factura con ese pdfUrl.
    expect(fn).toContain('.where("pdfUrl", "==", key)');
    // Y cualquier otra forma se rechaza.
    expect(fn).toContain('throw new HttpsError("invalid-argument", "Key inválida.")');
  });

  it("acepta las keys REALES que genera la aplicacion", () => {
    expect(aceptada("clientes/empresaA/reportes/2026-08/10/reporte-digital.pdf")).toBe(true);
    expect(aceptada("clientes/JR1khdwaRbRJEa3GfN57/reportes/2026-12/31/reporte.pdf")).toBe(true);
    expect(aceptada("vista360/facturas/1784438525571-witr63am.pdf")).toBe(true);
  });

  it("RECHAZA keys manipuladas para salir de las carpetas autorizadas", () => {
    for (const ataque of [
      "clientes/../../vista360/avatares/x.pdf",
      "clientes/empresaA/../otro/reportes/2026-08/10/reporte.pdf",
      "clientes/empresaA/reportes/2026-08/10/../../../secreto.pdf",
      "vista360/avatares/foto.png",
      "vista360/campanas/imagen.webp",
      "clientes/empresaA/contratos/privado.pdf",
      "clientes/empresaA/reportes/2026-08/10/reporte.exe",
      "/clientes/empresaA/reportes/2026-08/10/reporte.pdf",
      "clientes/empresaA/reportes/agosto/10/reporte.pdf",
      "vista360/facturas/../../clientes/otro/x.pdf",
    ]) {
      expect(aceptada(ataque), `deberia rechazar ${ataque}`).toBe(false);
    }
  });
});

describe("la interfaz del Trabajador refleja lo que el backend le permite", () => {
  const picker = leer("src/components/AdminClientPicker.tsx");
  const sidebar = leer("src/components/Sidebar.tsx");

  it("no ve Usuarios, Paneles, Analítica ni Aprobaciones", () => {
    for (const accion of ["onOpenUsuarios", "onOpenPaneles", "onOpenAnalitica", "onOpenAprobaciones"]) {
      const usos = [...picker.matchAll(new RegExp(`onClick=\\{${accion}\\}`, "g"))];
      expect(usos.length, `${accion} deberia usarse en el picker`).toBeGreaterThan(0);
      for (const uso of usos) {
        // Cada boton debe estar dentro de una condicion esGerente.
        const antes = picker.slice(Math.max(0, uso.index! - 400), uso.index!);
        expect(antes, `${accion} sin proteger por esGerente`).toContain("esGerente &&");
      }
    }
  });

  it("SÍ ve Solicitudes, Ocupación y Cotizaciones", () => {
    // Son sus herramientas de trabajo: no deben estar detras de esGerente.
    for (const accion of ["onOpenSolicitudes", "onOpenOcupacion", "onOpenCotizaciones"]) {
      const i = picker.indexOf(`onClick={${accion}}`);
      expect(i, `${accion} deberia existir`).toBeGreaterThan(-1);
      const antes = picker.slice(Math.max(0, i - 200), i);
      expect(antes, `${accion} no deberia exigir esGerente`).not.toContain("esGerente &&");
    }
  });

  it("el menú lateral filtra por esGerente, no por isAdmin", () => {
    expect(sidebar).toContain("!it.adminOnly || esGerente");
  });

  it("ocultar en la interfaz NO sustituye a la autorizacion del servidor", () => {
    // Aunque entre por URL directa, el backend sigue denegando.
    const analitica = sinComentarios(leer("functions/src/listarAccesosClientes.ts"));
    expect(analitica).toMatch(/role\s*!==\s*"admin"/);
    const usuarios = sinComentarios(leer("functions/src/administrarUsuarioPortal.ts"));
    expect(usuarios).toMatch(/role|esGerente|admin/);
  });
});
