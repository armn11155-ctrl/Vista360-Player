import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * REGRESIÓN — auditoría de ciberseguridad, agosto 2026 (OWASP API4:2023
 * Unrestricted Resource Consumption). Estas cinco funciones hacían
 * trabajo caro (firmar hasta 60 URLs de R2, leer TODAS las facturas de
 * la historia del negocio, mandar correo a cualquier destinatario,
 * resetear la contraseña de otra cuenta) sin ningún tope de ritmo por
 * uid -- un bucle desde la consola del navegador (o una sesión admin
 * comprometida) podía multiplicar el costo o usarse para bloquear
 * repetidamente el acceso de un cliente.
 *
 * limiteDePeticiones.test.ts ya tiene una red de seguridad genérica
 * ("TODA función que pueda llamar un cliente tiene tope"), pero su
 * heurística excluye cualquier archivo que contenga esPersonalInterno/
 * esGerente en CUALQUIER parte del código -- lo cual excluía por error
 * a listarReportesCliente.ts y firmarUrlsR2.ts, que SÍ son llamables
 * por un cliente (esPersonalInterno ahí solo amplía el acceso para
 * personal interno, no lo restringe). Este archivo fija explícitamente
 * las cinco funciones tocadas en esta revisión, sin depender de esa
 * heurística.
 */

const FUNCIONES = resolve(__dirname, "../../functions/src");
const leer = (f: string) => readFileSync(resolve(FUNCIONES, f), "utf-8");

describe("funciones caras con tope de ritmo agregado en la auditoría de seguridad", () => {
  const casos: Array<{ archivo: string; operacion: string }> = [
    { archivo: "listarReportesCliente.ts", operacion: "listarReportesCliente" },
    { archivo: "firmarUrlsR2.ts", operacion: "firmarUrlsR2" },
    { archivo: "resumenOcupacion.ts", operacion: "resumenOcupacion" },
    { archivo: "restablecerPasswordCliente.ts", operacion: "restablecerPasswordCliente" },
    { archivo: "enviarCorreoConPdf.ts", operacion: "enviarCorreoConPdf" },
  ];

  for (const { archivo, operacion } of casos) {
    it(`${archivo} llama a exigirRitmo con su propio nombre de operación`, () => {
      const codigo = leer(archivo);
      expect(codigo).toContain('import { exigirRitmo } from "./limitador.js"');
      expect(codigo).toContain(`exigirRitmo(`);
      expect(codigo).toContain(`"${operacion}"`);
    });
  }
});

/**
 * SEGUNDA TANDA -- misma auditoría, sección "cuenta Gerente
 * comprometida": administrarClienteAdmin (archivar/eliminar clientes),
 * administrarUsuarioPortal (archivar/eliminar personal),
 * limpiarArchivosHuerfanos y contarEvidenciasHuerfanas (barren R2 y
 * Firestore enteros) y restaurarDePapelera/listarPapelera NO tenían
 * NINGÚN límite de ritmo -- a diferencia de restablecerPasswordCliente,
 * que sí lo tenía desde la primera tanda. Una sesión de Gerente
 * comprometida podía, sin este límite, archivar o eliminar todos los
 * clientes del negocio en un bucle en segundos.
 */
describe("operaciones de Gerente destructivas/masivas -- segunda tanda de límites de ritmo", () => {
  const casos: Array<{ archivo: string; operacion: string }> = [
    { archivo: "administrarClienteAdmin.ts", operacion: "administrarClienteAdmin" },
    { archivo: "administrarUsuarioPortal.ts", operacion: "administrarUsuarioPortal" },
    { archivo: "limpiarArchivosHuerfanos.ts", operacion: "limpiarArchivosHuerfanos" },
    { archivo: "contarEvidenciasHuerfanas.ts", operacion: "contarEvidenciasHuerfanas" },
    { archivo: "papeleraR2.ts", operacion: "listarPapelera" },
    { archivo: "papeleraR2.ts", operacion: "restaurarDePapelera" },
  ];

  for (const { archivo, operacion } of casos) {
    it(`${archivo} (${operacion}) llama a exigirRitmo con su propio nombre de operación`, () => {
      const codigo = leer(archivo);
      expect(codigo).toContain('import { exigirRitmo } from "./limitador.js"');
      expect(codigo).toContain(`"${operacion}"`);
    });
  }

  it("limpiarArchivosHuerfanos deja auditoría del borrado real (no solo de la simulación)", () => {
    // Antes de esta revisión, un borrado masivo confirmado (confirmar:
    // true) no dejaba ningún rastro de quién lo ejecutó ni cuántos
    // archivos se fueron.
    const codigo = leer("limpiarArchivosHuerfanos.ts");
    expect(codigo).toContain('import { auditar } from "./registro.js"');
    expect(codigo).toContain('auditar("archivos_huerfanos_borrados"');
  });

  it("archivos_huerfanos_borrados está declarado en el tipo cerrado EventoAuditable", () => {
    const registro = leer("registro.ts");
    expect(registro).toMatch(/EventoAuditable\s*=[\s\S]*"archivos_huerfanos_borrados"/);
  });
});
