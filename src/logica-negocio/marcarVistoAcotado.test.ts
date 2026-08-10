import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * HALLAZGO: creacion de documentos sin tope por un cliente autenticado.
 *
 * marcarReporteVisto escribe con `set(..., { merge: true })`, que CREA el
 * documento si no existe. Eso es a proposito: los reportes viejos viven
 * en R2 y pueden no tener ficha en Firestore, asi que exigir que exista
 * romperia "marcar como visto" para ellos.
 *
 * Pero la validacion solo pedia que el informeId empezara por el
 * clienteId propio y no tuviera caracteres raros. El resto lo elegia el
 * cliente: llamando en bucle con sufijos distintos fabricaba documentos
 * sin tope en informesCliente y en su agregado. No filtra datos de nadie
 * -- el prefijo lo ata a su propio cliente -- pero crece para siempre y
 * lo paga Vista360.
 */
const FUNCIONES = resolve(__dirname, "../../functions/src");
const codigo = readFileSync(resolve(FUNCIONES, "marcarReporteVisto.ts"), "utf-8");

/** Reproduce las comprobaciones de la funcion sobre un informeId. */
function aceptado(clienteId: string, informeId: string): boolean {
  if (!clienteId || !informeId || !informeId.startsWith(`${clienteId}_`)) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(informeId)) return false;
  const sufijo = informeId.slice(clienteId.length + 1);
  return /^\d{4}-\d{2}(-\d{2})?$/.test(sufijo);
}

describe("marcarReporteVisto solo acepta ids de reporte reales", () => {
  it("la funcion exige que el sufijo sea una fecha", () => {
    // Si alguien quita esta comprobacion, vuelve la creacion sin tope.
    expect(codigo).toMatch(/\/\^\\d\{4\}-\\d\{2\}\(-\\d\{2\}\)\?\$\//);
    expect(codigo).toContain("informeId.slice(clienteId.length + 1)");
  });

  it("acepta los ids que genera la aplicacion", () => {
    // Si esto falla, la correccion rompe marcar como visto.
    expect(aceptado("empresaA", "empresaA_2026-08")).toBe(true);
    expect(aceptado("empresaA", "empresaA_2026-08-05")).toBe(true);
    expect(aceptado("JR1khdwaRbRJEa3GfN57", "JR1khdwaRbRJEa3GfN57_2026-12-31")).toBe(true);
  });

  it("RECHAZA los sufijos inventados que permitian crecer sin tope", () => {
    for (const basura of [
      "empresaA_basura1", "empresaA_basura2", "empresaA_a", "empresaA_",
      "empresaA_2026", "empresaA_2026-8", "empresaA_20260805",
      "empresaA_2026-08-05-06", "empresaA_2026-08_extra",
    ]) {
      expect(aceptado("empresaA", basura), `deberia rechazar ${basura}`).toBe(false);
    }
  });

  it("sigue sin poder tocar el reporte de OTRO cliente", () => {
    // La defensa de siempre: el prefijo y la comparacion contra el
    // clienteId que consta en portalUsers, no contra lo que manda nadie.
    expect(aceptado("empresaA", "empresaB_2026-08-05")).toBe(false);
    expect(codigo).toContain('propioData?.clienteId !== clienteId');
    expect(codigo).toContain("permission-denied");
  });

  it("sigue sin poder salir de la coleccion con barras", () => {
    expect(aceptado("empresaA", "empresaA_2026-08/../otro")).toBe(false);
    expect(aceptado("empresaA", "empresaA_a/b/c")).toBe(false);
  });
});
