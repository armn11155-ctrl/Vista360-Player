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
 * Estos tests fijan las defensas: un deploy normal no toca secretos,
 * una rotación no duplica valores y la poda examina TODAS las páginas
 * sin destruir una versión que producción tenga fijada.
 */

const script = readFileSync(
  resolve(__dirname, "../../scripts/set-r2-secrets-direct.mjs"),
  "utf-8",
);
const workflow = readFileSync(
  resolve(__dirname, "../../.github/workflows/setup-r2-secrets-and-deploy.yml"),
  "utf-8",
);

describe("no se crean versiones de secreto innecesarias", () => {
  it("un deploy normal no sincroniza ni rota secretos", () => {
    expect(workflow).toContain("actualizar_secretos:");
    const paso = workflow.slice(
      workflow.indexOf("- name: Configurar secrets"),
      workflow.indexOf("- name:", workflow.indexOf("- name: Configurar secrets") + 10),
    );
    expect(paso).toContain("if: ${{ inputs.actualizar_secretos }}");
  });

  it("se compara con el valor actual antes de añadir una versión", () => {
    // Casi siempre se redespliega por el código, no por los secretos.
    expect(script).toContain("versions/latest:access");
    expect(script).toContain("Buffer.from(actual.json.payload.data, 'base64')");
    expect(script).toContain("valorActual?.equals(Buffer.from(value, 'utf-8'))");
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
  it("se listan y se destruyen solo con autorización explícita", () => {
    expect(script).toContain("/versions?pageSize=");
    expect(script).toContain(":destroy");
    expect(script).toContain("DESTRUIR_VERSIONES_OBSOLETAS === 'true'");
  });

  it("se destruyen también las DISABLED, que TAMBIÉN se cobran", () => {
    // Google factura las versiones ENABLED **y** las DISABLED:
    // deshabilitar una no deja de cobrarla, solo destruirla. Filtrar por
    // ENABLED dejaría las deshabilitadas pagando para siempre -- que es
    // justo lo que se venía a arreglar. Solo DESTROYED deja de costar.
    expect(script).toContain("v.state !== 'DESTROYED'");
    expect(script).not.toContain("v.state === 'ENABLED'");
  });

  it("recorre todas las páginas, no solo las primeras 100 versiones", () => {
    expect(script).toContain("nextPageToken");
    expect(script).toContain("do {");
    expect(script).toContain("} while (pageToken)");
  });

  it("protege latest y todas las versiones fijadas por Functions", () => {
    expect(script).toContain("secretEnvironmentVariables");
    expect(script).toContain("versiones.add(version)");
    expect(script).toContain("protegidas.add(latest)");
    expect(script).toContain("!protegidas.has(versionId(v))");
  });

  it("si no puede comprobar las referencias de producción, no destruye nada", () => {
    expect(script).toContain("if (!referenciasProduccion.ok)");
    expect(script).toContain("referenciasProduccion.ok\n    ? facturables.filter");
    expect(script).toContain(": [];");
  });
});
