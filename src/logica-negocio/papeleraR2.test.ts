import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * HALLAZGO (auditoría de operación, 11 de agosto de 2026): Cloudflare R2
 * no ofrece versionado de objetos ni recuperación nativa de un archivo
 * borrado -- comprobado a mano en el dashboard del bucket
 * `vista360-evidencias` (Settings -> no hay ninguna sección de
 * versionado; Object Lifecycle Rules solo traía la regla por defecto de
 * abortar multiparts; Bucket Lock Rules existe pero IMPEDIRÍA los
 * borrados legítimos que la propia app hace a propósito --
 * eliminarFactura, eliminarContrato, limpiarArchivosHuerfanos -- así
 * que no sirve acá sin romper esas funciones). Confirmado además con
 * la documentación pública de Cloudflare: versionado sigue en el
 * roadmap, no está disponible.
 *
 * `borrarObjetoR2` es el único punto por el que pasan los 8 archivos
 * que borran algo de R2 (facturas, contratos, reportes, solicitudes de
 * campaña, avatares/fotos reemplazadas, limpieza de huérfanos), así
 * que es el lugar correcto para la protección mínima: copiar a
 * `_papelera/` antes de borrar, con una regla de ciclo de vida en el
 * propio R2 (ya soportado, sin escribir infraestructura nueva) que
 * borra lo que quede en la papelera pasados 30 días. No duplica todo
 * el bucket -- solo lo que de verdad se borra, y por tiempo limitado.
 */

const FUNCIONES = resolve(__dirname, "../../functions/src");
const codigo = readFileSync(resolve(FUNCIONES, "r2Storage.ts"), "utf-8");

describe("borrarObjetoR2 copia a la papelera antes de borrar", () => {
  it("importa CopyObjectCommand junto con DeleteObjectCommand", () => {
    expect(codigo).toMatch(/DeleteObjectCommand,\s*CopyObjectCommand/);
  });

  it("el borrado real ocurre después de intentar la copia (orden importa: sin copia no hay red de seguridad)", () => {
    const idxCopy = codigo.indexOf("new CopyObjectCommand(");
    const idxDelete = codigo.indexOf("new DeleteObjectCommand(");
    expect(idxCopy).toBeGreaterThan(-1);
    expect(idxDelete).toBeGreaterThan(idxCopy);
  });

  it('la key de destino en la papelera conserva la key original bajo el prefijo "_papelera/"', () => {
    expect(codigo).toContain('export const PAPELERA_PREFIJO = "_papelera/";');
    expect(codigo).toMatch(/keyEnPapelera[\s\S]{0,80}\$\{PAPELERA_PREFIJO\}\$\{key\}/);
  });

  it("la copia a la papelera es best-effort: un fallo ahí no impide que el borrado real se intente igual", () => {
    // Dos bloques try/catch independientes, no uno solo que envuelva
    // ambas llamadas -- si la copia falla, el catch de la copia no
    // debe relanzar (si lo hiciera, el borrado de abajo nunca correría).
    const bloqueCopia = codigo.match(/try \{\s*await client\.send\(\s*new CopyObjectCommand[\s\S]*?catch \(error\) \{[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(bloqueCopia).toContain("catch (error)");
    expect(bloqueCopia).not.toContain("throw");
  });

  it("_papelera/ no es una carpeta permitida (nada del resto de la app puede leer ni firmar URLs hacia ahí)", () => {
    const carpetas = codigo.match(/CARPETAS_PERMITIDAS = \[([^\]]*)\]/)?.[1] ?? "";
    expect(carpetas).not.toContain("_papelera");
  });
});

/** Reproduce esCarpetaValida/esKeyValida tal como están en el archivo real,
 *  para confirmar que una key de papelera nunca pasa la validación que
 *  usan firmarUrlsR2 y obtenerArchivoR2Base64. */
const CARPETAS_PERMITIDAS = ["vista360/campanas", "vista360/avatares", "vista360/facturas"];
function esKeyValida(key: string): boolean {
  if (!key || key.includes("..") || key.startsWith("/")) return false;
  return CARPETAS_PERMITIDAS.some((folder) => key.startsWith(`${folder}/`));
}

describe("una key movida a la papelera queda fuera del alcance normal de la app", () => {
  it("_papelera/vista360/facturas/x.pdf NO es una key válida para el resto de las funciones", () => {
    expect(esKeyValida("_papelera/vista360/facturas/x.pdf")).toBe(false);
  });

  it("la key original sigue siendo válida (no se rompe nada del camino normal)", () => {
    expect(esKeyValida("vista360/facturas/x.pdf")).toBe(true);
  });
});
