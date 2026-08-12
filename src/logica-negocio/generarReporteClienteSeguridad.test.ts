import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * REGRESIÓN DE SEGURIDAD — CVE interno (auditoría de ciberseguridad,
 * agosto 2026): generarReporteCliente.ts borraba de R2 cualquier clave
 * recibida en panelesFotos[].fotos[].url ANTES de comprobar sesión y
 * rol, porque esa recolección corría fuera del try/catch de auth y el
 * finally se ejecuta siempre (incluso cuando el try lanza por falta de
 * sesión). Un atacante SIN autenticarse podía borrar cualquier factura,
 * avatar o foto de campaña con solo conocer o adivinar su clave de R2.
 *
 * Esta función pasó después a usar exigirPersonalInterno() (el helper
 * centralizado de cuentaPortal.ts -- ver cierre de la ventana residual
 * de sesión archivada en la misma auditoría), pero la propiedad que
 * este archivo protege es la MISMA: la comprobación de cuenta/rol tiene
 * que ocurrir ANTES de tocar `request.data` para armar
 * `clavesTemporales`, y no puede haber ninguna forma de que el bloque
 * `finally` se ejecute sin haber pasado por esa comprobación primero.
 */

const FUNCIONES = resolve(__dirname, "../../functions/src");
const codigo = readFileSync(resolve(FUNCIONES, "generarReporteCliente.ts"), "utf-8");

function indiceDe(marcador: string): number {
  const i = codigo.indexOf(marcador);
  expect(i, `no se encontró "${marcador}" en generarReporteCliente.ts`).toBeGreaterThan(-1);
  return i;
}

describe("generarReporteCliente: la limpieza de R2 no puede correr sin pasar por exigirPersonalInterno", () => {
  it("pasa por el helper centralizado de cuenta activa, no por una comprobación local", () => {
    expect(codigo).toContain('import { exigirPersonalInterno } from "./cuentaPortal.js"');
    expect(codigo).toContain("await exigirPersonalInterno(request,");
  });

  it("la llamada a exigirPersonalInterno ocurre ANTES de leer panelesFotos", () => {
    const idxAuthCheck = indiceDe("await exigirPersonalInterno(request,");
    const idxLecturaFotos = indiceDe("request.data?.panelesFotos");
    expect(idxAuthCheck).toBeLessThan(idxLecturaFotos);
  });

  it("clavesTemporales se declara DESPUÉS de exigirPersonalInterno, no antes", () => {
    const idxAuthCheck = indiceDe("await exigirPersonalInterno(request,");
    const idxDeclaracion = indiceDe("const clavesTemporales: string[] = []");
    expect(idxDeclaracion).toBeGreaterThan(idxAuthCheck);
  });

  it("el try/finally que borra las claves está DESPUÉS de exigirPersonalInterno", () => {
    // No basta con que la recolección esté después: el try{...}finally
    // que ejecuta borrarObjetoR2 también debe empezar después, para que
    // ninguna ruta de código llegue al finally sin haber pasado auth.
    const idxAuthCheck = indiceDe("await exigirPersonalInterno(request,");
    const idxTry = codigo.indexOf("try {", idxAuthCheck);
    expect(idxTry, "no se encontró un try{ después de exigirPersonalInterno").toBeGreaterThan(-1);
    const idxFinallyBorra = indiceDe("clavesTemporales.map((k) => borrarObjetoR2(k))");
    expect(idxFinallyBorra).toBeGreaterThan(idxTry);
  });

  it("sigue existiendo la limpieza real (no se rompió la función al mover el orden)", () => {
    expect(codigo).toContain("finally {");
    expect(codigo).toContain("borrarObjetoR2(k)");
  });
});
