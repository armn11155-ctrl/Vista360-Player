import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * SECRET MANAGER: el cargo que solo sube.
 *
 * Secret Manager cobra por VERSIÓN ACTIVA (~$0.06 al mes cada una, SKU
 * "Secret version replica storage"). El script del despliegue añadía una
 * versión de cada secreto en CADA ejecución del workflow y no borraba
 * ninguna: con 6 secretos, cada despliegue dejaba 6 versiones cobrando
 * para siempre.
 *
 * Es exactamente la misma familia que las imágenes de contenedor en
 * Artifact Registry: residuo de despliegue que nadie mira porque la
 * aplicación funciona igual de bien. Se descubrió mirando la factura,
 * no por ningún error.
 *
 * Estos tests fijan las dos defensas: no crear versiones que no hacen
 * falta, y destruir las viejas.
 */

const script = readFileSync(
  resolve(__dirname, "../../scripts/set-r2-secrets-direct.mjs"),
  "utf-8",
);

describe("no se crean versiones de secreto innecesarias", () => {
  it("se compara con el valor actual antes de añadir una versión", () => {
    // Casi siempre se redespliega por el código, no por los secretos.
    expect(script).toContain("versions/latest:access");
    expect(script).toContain("actual.json?.payload?.data === b64");
  });

  it("si el valor no cambió, NO se crea versión", () => {
    const bloque = script.slice(script.indexOf("const yaEstaba"));
    expect(bloque.slice(0, 400)).toMatch(/if \(yaEstaba\)/);
    // El addVersion tiene que quedar en la rama contraria.
    const idxYa = script.indexOf("if (yaEstaba)");
    const idxAdd = script.indexOf(":addVersion", idxYa);
    expect(idxAdd).toBeGreaterThan(idxYa);
    expect(script.slice(idxYa, idxAdd)).toContain("} else {");
  });
});

describe("las versiones viejas se destruyen", () => {
  it("se listan y se destruyen las que sobran", () => {
    expect(script).toContain("/versions?pageSize=");
    expect(script).toContain(":destroy");
  });

  it("solo cuentan las ENABLED: una destruida ya no se cobra", () => {
    expect(script).toContain("v.state === 'ENABLED'");
  });

  it("se conservan algunas para poder volver atrás", () => {
    const n = Number(/VERSIONES_A_CONSERVAR = (\d+)/.exec(script)![1]);
    // Con 0 se destruiría la que está en uso; con muchas vuelve el cargo.
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(5);
    expect(script).toContain("activas.slice(VERSIONES_A_CONSERVAR)");
  });

  it("un fallo al limpiar NO tumba el despliegue", () => {
    // Es higiene de coste, no despliegue. Si Secret Manager responde
    // mal, los secretos ya están puestos y las funciones deben subir.
    const bloque = script.slice(script.indexOf("const lista = await call"));
    expect(bloque).toContain("console.warn");
    expect(bloque.slice(0, 600)).toContain("continue;");
  });
});
