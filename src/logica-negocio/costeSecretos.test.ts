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

  it("se destruyen también las DISABLED, que TAMBIÉN se cobran", () => {
    // Google factura las versiones ENABLED **y** las DISABLED:
    // deshabilitar una no deja de cobrarla, solo destruirla. Filtrar por
    // ENABLED dejaría las deshabilitadas pagando para siempre -- que es
    // justo lo que se venía a arreglar. Solo DESTROYED deja de costar.
    expect(script).toContain("v.state !== 'DESTROYED'");
    expect(script).not.toContain("v.state === 'ENABLED'");
  });

  it("se conservan DOS, y el motivo está escrito", () => {
    // Una función fija la versión del secreto al desplegarse, y este
    // script corre ANTES del redespliegue: con una sola versión, las
    // funciones ya desplegadas se quedarían sin secreto en esa ventana.
    expect(script).toContain("VERSIONES_A_CONSERVAR = 2");
    // El comentario va partido en varias líneas con `*` delante, así que
    // se normalizan los espacios antes de buscar la frase.
    const doc = script
      .slice(0, script.indexOf("const VERSIONES_A_CONSERVAR"))
      .replace(/\n\s*\*\s*/g, " ")
      .replace(/\s+/g, " ");
    expect(doc).toContain("fija la versión del secreto");
    expect(doc).toContain("plan gratuito cubre 6 versiones");
  });

  it("se conservan algunas para poder volver atrás", () => {
    const n = Number(/VERSIONES_A_CONSERVAR = (\d+)/.exec(script)![1]);
    // Con 0 se destruiría la que está en uso; con muchas vuelve el cargo.
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(5);
    expect(script).toContain("facturables.slice(VERSIONES_A_CONSERVAR)");
  });

  it("un fallo al limpiar NO tumba el despliegue", () => {
    // Es higiene de coste, no despliegue. Si Secret Manager responde
    // mal, los secretos ya están puestos y las funciones deben subir.
    const bloque = script.slice(script.indexOf("const lista = await call"));
    expect(bloque).toContain("console.warn");
    expect(bloque.slice(0, 600)).toContain("continue;");
  });
});
