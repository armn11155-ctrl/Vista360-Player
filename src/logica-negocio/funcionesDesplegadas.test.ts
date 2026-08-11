import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * HALLAZGO REAL (verificación en producción de Papelera, 11-ago-2026):
 * el workflow de despliegue (`setup-r2-secrets-and-deploy.yml`) NO
 * despliega "todo lo que exporta functions/src/index.ts" -- despliega
 * una lista de nombres escrita a mano en varios pasos `--only
 * functions:a,b,c,...`. `index.ts` sí se compila y se sube completo
 * (el paso "Instalar y compilar functions" no filtra nada), así que
 * `npx tsc --noEmit` y el build pasan en verde sin decir nada raro.
 *
 * Consecuencia real: se agregaron `listarPapelera` y
 * `restaurarDePapelera`, se exportaron desde `index.ts`, todo compiló y
 * el propio workflow de deploy terminó en verde -- pero como esos dos
 * nombres nunca se agregaron a ningún `--only functions:...`, Firebase
 * nunca las publicó. La pantalla Papelera, ya en producción, fallaba con
 * un error genérico al primer uso real. Nada en CI lo había detectado
 * porque nada comprobaba esta lista contra `index.ts`.
 *
 * Esto cierra ese agujero para cualquier función futura, no solo para
 * Papelera: cada nombre que `index.ts` exporta tiene que aparecer en
 * ALGÚN `--only functions:` del workflow (pueden estar repartidos en
 * varios pasos -- las que llevan trigger/scheduler se despliegan
 * aparte -- por eso se busca en el archivo completo, no en una sola
 * línea).
 */
const RAIZ = resolve(__dirname, "../..");
const indexTs = readFileSync(resolve(RAIZ, "functions/src/index.ts"), "utf-8");
const workflow = readFileSync(
  resolve(RAIZ, ".github/workflows/setup-r2-secrets-and-deploy.yml"),
  "utf-8"
);

/** Extrae los nombres de función de cada `export { a, b } from "./x.js";`
 *  -- exactamente como se escriben en index.ts, tal cual las lee Firebase
 *  para nombrar la Cloud Function real. */
function nombresExportados(codigo: string): string[] {
  const nombres: string[] = [];
  const regex = /export\s*\{([^}]+)\}\s*from/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(codigo))) {
    for (const parte of m[1].split(",")) {
      const nombre = parte.trim();
      if (nombre) nombres.push(nombre);
    }
  }
  return nombres;
}

describe("toda función exportada por index.ts se despliega de verdad", () => {
  const exportadas = nombresExportados(indexTs);

  it("se encontraron funciones exportadas (si esto da 0, el regex se rompió, no que no haya funciones)", () => {
    expect(exportadas.length).toBeGreaterThan(40);
  });

  it("listarPapelera y restaurarDePapelera están exportadas (regresión directa del hallazgo)", () => {
    expect(exportadas).toContain("listarPapelera");
    expect(exportadas).toContain("restaurarDePapelera");
  });

  it.each(nombresExportados(indexTs))(
    "%s aparece en algún --only functions: del workflow de deploy",
    (nombre) => {
      // Se busca como nombre de function COMPLETO (con los separadores
      // que usa `--only`: coma, dos puntos o fin de línea) para que
      // "listarPapelera" no dé un falso positivo por ser substring de
      // otro nombre más largo.
      const patron = new RegExp(`functions:${nombre}(?:[,\\s]|$)`);
      expect(workflow, `"${nombre}" se exporta en index.ts pero no aparece en ningún --only functions: del workflow -- nunca se despliega.`).toMatch(patron);
    }
  );
});
