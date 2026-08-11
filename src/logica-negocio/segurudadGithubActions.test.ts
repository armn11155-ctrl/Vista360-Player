import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * SUPPLY CHAIN — auditoría de ciberseguridad, agosto 2026.
 *
 * Cada `uses: owner/repo@v5` referencia una ETIQUETA, que es mutable:
 * quien controle esa Action (o robe la cuenta de quien la mantiene)
 * puede mover la etiqueta a un commit distinto y todos los workflows
 * que la usan ejecutan el código nuevo en el próximo run, sin ningún
 * aviso ni revisión (el caso real: tj-actions/changed-files, marzo
 * 2025). Fijar el commit exacto (`@<sha> # v5`) hace que mover la
 * etiqueta no tenga ningún efecto -- el workflow sigue apuntando al
 * commit que se revisó.
 *
 * Este archivo no vuelve a auditar CADA workflow línea por línea (ya
 * se hizo a mano); fija la regla para que un `uses:` nuevo, sin pin,
 * no pueda colarse sin que un test se dé cuenta.
 */

const WORKFLOWS_DIR = resolve(__dirname, "../../.github/workflows");
const archivos = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

function leer(archivo: string): string {
  return readFileSync(resolve(WORKFLOWS_DIR, archivo), "utf-8");
}

describe("las Actions de terceros están fijadas a un commit, no a una etiqueta móvil", () => {
  it("existen workflows para auditar (red de seguridad de esta prueba)", () => {
    expect(archivos.length).toBeGreaterThan(0);
  });

  it("ningún `uses:` referencia una Action por etiqueta/rama mutable", () => {
    // owner/repo@<40 hex> es lo único aceptado. owner/repo@v5,
    // owner/repo@main, owner/repo@latest quedan atrapados acá.
    const SHA_COMPLETO = /^[0-9a-f]{40}$/;
    const culpables: string[] = [];
    for (const archivo of archivos) {
      const codigo = leer(archivo);
      for (const m of codigo.matchAll(/uses:\s*([\w.-]+\/[\w.-]+)@([^\s#]+)/g)) {
        const [, accion, ref] = m;
        if (!SHA_COMPLETO.test(ref)) culpables.push(`${archivo}: ${accion}@${ref}`);
      }
    }
    expect(culpables).toEqual([]);
  });

  it("cada Action fijada a un commit deja un comentario con la versión legible", () => {
    // Fijar a un hash sin más deja el workflow ilegible (¿qué versión
    // es esa?) y difícil de actualizar a mano. `# v5` al lado resuelve
    // ambas cosas sin reintroducir la etiqueta como referencia real.
    const culpables: string[] = [];
    for (const archivo of archivos) {
      const codigo = leer(archivo);
      for (const linea of codigo.split("\n")) {
        const m = /uses:\s*[\w.-]+\/[\w.-]+@[0-9a-f]{40}/.exec(linea);
        if (m && !linea.includes("#")) culpables.push(`${archivo}: ${linea.trim()}`);
      }
    }
    expect(culpables).toEqual([]);
  });
});

describe("cada workflow declara sus propios permisos (mínimo privilegio)", () => {
  it("todos los workflows tienen un bloque permissions: explícito", () => {
    const sinPermisos = archivos.filter((archivo) => !leer(archivo).includes("permissions:"));
    expect(sinPermisos).toEqual([]);
  });

  it("ningún workflow pide más de contents: write (nada de packages/id-token/etc. sin uso)", () => {
    // No es una lista blanca exhaustiva -- es un aviso temprano si un
    // cambio futuro agrega un permiso amplio sin que nadie lo note.
    const conPermisoAmplio: string[] = [];
    for (const archivo of archivos) {
      const codigo = leer(archivo);
      const bloque = /permissions:\s*\n((?:\s+\w[\w-]*:\s*\w+\n?)+)/.exec(codigo);
      if (!bloque) continue;
      if (/\b(write-all|packages:\s*write|id-token:\s*write)\b/.test(bloque[1])) {
        conPermisoAmplio.push(archivo);
      }
    }
    expect(conPermisoAmplio).toEqual([]);
  });
});
