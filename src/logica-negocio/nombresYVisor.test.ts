import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { nombreDescargaSeguro } from "../../functions/src/validaciones.js";

const RAIZ = resolve(__dirname, "../..");
const leer = (f: string) => readFileSync(resolve(RAIZ, f), "utf-8");

describe("el visor no puede volver a dejar una pestaña en blanco", () => {
  /**
   * EL FALLO. `verArchivo` abría la pestaña con
   * `window.open("", "_blank", "noopener")`. Con `noopener`, window.open
   * DEVUELVE null -- está en la especificación, no es cosa de un
   * navegador concreto. Así que la función se quedaba sin referencia a la
   * pestaña que acababa de abrir, y cargaba el PDF en la pestaña
   * ORIGINAL. La persona veía una pestaña `about:blank` huérfana que
   * nunca se llenaba.
   */
  const codigo = leer("src/utils/descargarArchivo.ts");
  const verArchivo = codigo.slice(codigo.indexOf("export async function verArchivo"));

  it("no pide noopener en el window.open cuya referencia necesita", () => {
    const apertura = verArchivo.match(/window\.open\((.*?)\);/s)?.[1] ?? "";
    expect(apertura).not.toContain("noopener");
  });

  it("pero sigue anulando opener, que es lo que noopener protegía", () => {
    // Quitar noopener sin esto dejaría a la pestaña nueva tocando la
    // original: se cambiaría un fallo visible por uno de seguridad.
    expect(verArchivo).toContain("ventana.opener = null");
  });

  it("comprueba que la ventana existe antes de usarla", () => {
    // Si el navegador bloquea la pestaña emergente, window.open devuelve
    // null igual. Sin esta guarda, el fallo vuelve por otra puerta.
    expect(verArchivo).toMatch(/if \(ventana && !ventana\.closed\)/);
    expect(verArchivo).toContain("window.location.href = urlLocal");
  });
});

describe("nombre del PDF de factura", () => {
  const codigo = leer("src/components/FacturaCard.tsx");
  const fn = codigo.slice(
    codigo.indexOf("function nombreArchivoFactura"),
    codigo.indexOf("function nombreArchivoFactura") + 700,
  );

  it("usa la fecha de emisión, igual que el reporte", () => {
    // "Factura 05 Ago 2026.pdf" junto a "Reporte 05 Ago 2026.pdf": en la
    // misma carpeta se ordenan y se reconocen igual.
    expect(fn).toContain("fechaDeFactura(f.fecha_emision)");
    expect(fn).toContain("MESES_CORTOS[fecha.getMonth()]");
    expect(fn).toContain('padStart(2, "0")');
  });

  it("nunca produce un archivo llamado undefined", () => {
    // Las facturas sincronizadas del sistema externo pueden llegar sin
    // fecha de emisión.
    expect(fn).toContain('f.numero_fmt || f.serie || "Vista360"');
  });

  it("los dos botones y la firma usan el MISMO nombre", () => {
    // Antes "Ver" y "Descargar" mandaban cada uno el suyo.
    const usos = codigo.match(/nombreArchivoFactura\(f\)/g) ?? [];
    expect(usos.length).toBeGreaterThanOrEqual(4);
    expect(codigo).not.toMatch(/`\$\{f\.numero_fmt \|\| f\.serie \|\| "factura"\}\.pdf`/);
  });
});

describe("el nombre de descarga no puede inyectar cabeceras", () => {
  /**
   * El nombre lo elige el navegador y termina en
   * `attachment; filename="<aquí>"`. Unas comillas cierran el campo antes
   * de tiempo; un salto de línea abre una cabecera nueva.
   */
  it("quita comillas, saltos de línea y barras", () => {
    expect(nombreDescargaSeguro('a"; X-Malo: si')).toBe("a X-Malo si");
    expect(nombreDescargaSeguro("a\r\nX-Malo: si")).toBe("a X-Malo si");
    expect(nombreDescargaSeguro("../../otro")).toBe("....otro");
    expect(nombreDescargaSeguro("a/b\\c")).toBe("abc");
  });

  it("deja intacto un nombre normal", () => {
    // Si esto falla, la corrección rompe la funcionalidad que arregla.
    expect(nombreDescargaSeguro("Factura 05 Ago 2026.pdf")).toBe("Factura 05 Ago 2026.pdf");
    expect(nombreDescargaSeguro("Reporte 05 Ago 2026.pdf")).toBe("Reporte 05 Ago 2026.pdf");
    expect(nombreDescargaSeguro("Factura F001-123 (copia).pdf")).toBe("Factura F001-123 (copia).pdf");
  });

  it("acota el largo y nunca devuelve vacío", () => {
    expect(nombreDescargaSeguro("a".repeat(500)).length).toBeLessThanOrEqual(120);
    expect(nombreDescargaSeguro("///")).toBe("archivo");
    expect(nombreDescargaSeguro(undefined)).toBe("archivo");
    expect(nombreDescargaSeguro(123)).toBe("archivo");
  });

  it("se aplica en el ÚNICO sitio que arma la cabecera", () => {
    // Red de seguridad: si alguien arma otro Content-Disposition a mano,
    // se salta el filtro. Debe haber exactamente uno, y saneado.
    const r2 = leer("functions/src/r2Storage.ts");
    const armados = r2.match(/ResponseContentDisposition/g) ?? [];
    expect(armados.length).toBe(1);
    expect(r2).toContain("nombreDescargaSeguro(nombreDescarga)");
  });
});
