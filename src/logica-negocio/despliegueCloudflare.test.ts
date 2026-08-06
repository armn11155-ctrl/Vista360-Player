import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guardián del despliegue de Cloudflare Pages.
 *
 * QUÉ PASÓ, para que no vuelva a pasar.
 *
 * Se añadieron pruebas en `src/` que importan código de `functions/src`
 * para EJECUTARLO (probar el validador de verdad, no leerlo como texto).
 * En local pasaba todo: `tsc --noEmit` resolvía `firebase-functions`
 * desde `functions/node_modules`, que estaba instalado.
 *
 * Cloudflare Pages solo ejecuta `npm ci` en la raíz. Allí
 * `functions/node_modules` NO existe, así que el mismo `tsc --noEmit`
 * seguía el import desde la prueba y moría con TS2307 -- y el sitio
 * entero se quedó sin desplegar.
 *
 * La verificación en local estaba contaminada por un estado que el
 * despliegue no tiene. Esta prueba comprueba la regla directamente:
 * cualquier archivo de `functions/` que alcance una prueba del frontend
 * solo puede depender de paquetes que estén en el package.json de la RAÍZ.
 */

const RAIZ = resolve(__dirname, "../..");
const FUNCIONES = resolve(RAIZ, "functions/src");

const paqueteRaiz = JSON.parse(readFileSync(resolve(RAIZ, "package.json"), "utf-8"));
const DISPONIBLES = new Set([
  ...Object.keys(paqueteRaiz.dependencies ?? {}),
  ...Object.keys(paqueteRaiz.devDependencies ?? {}),
]);

/** Devuelve los imports de un archivo: los relativos y los de paquete. */
function importesDe(ruta: string) {
  const codigo = readFileSync(ruta, "utf-8");
  const relativos: string[] = [];
  const paquetes: string[] = [];
  for (const m of codigo.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)) {
    const destino = m[1];
    if (destino.startsWith(".")) relativos.push(destino);
    else if (!destino.startsWith("node:")) paquetes.push(destino);
  }
  return { relativos, paquetes };
}

describe("el despliegue de Cloudflare no puede romperse por las pruebas", () => {
  it("nada que importe una prueba de src/ depende de functions/node_modules", () => {
    // 1. Qué archivos de functions/ alcanzan las pruebas del frontend.
    const pendientes: string[] = [];
    const buscarEn = (dir: string) => {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        const ruta = resolve(dir, entrada.name);
        if (entrada.isDirectory()) {
          buscarEn(ruta);
          continue;
        }
        if (!/\.tsx?$/.test(entrada.name)) continue;
        // Solo sentencias import de verdad: buscar la cadena suelta
        // encontraba texto dentro de los comentarios.
        for (const destino of importesDe(ruta).relativos) {
          if (!destino.includes("functions/src/")) continue;
          pendientes.push(resolve(ruta, "..", destino.replace(/\.js$/, ".ts")));
        }
      }
    };
    buscarEn(resolve(RAIZ, "src"));

    // 2. Se sigue la cadena completa de imports relativos.
    const vistos = new Set<string>();
    const culpables: string[] = [];
    while (pendientes.length > 0) {
      const archivo = pendientes.pop()!;
      if (vistos.has(archivo)) continue;
      vistos.add(archivo);
      if (!existsSync(archivo)) continue;
      const { relativos, paquetes } = importesDe(archivo);
      for (const paquete of paquetes) {
        // Se compara la raíz del paquete: "firebase-functions/v2/https"
        // se instala como "firebase-functions".
        const nombre = paquete.startsWith("@")
          ? paquete.split("/").slice(0, 2).join("/")
          : paquete.split("/")[0];
        if (!DISPONIBLES.has(nombre)) {
          culpables.push(`${archivo.replace(RAIZ + "/", "")} importa ${nombre}`);
        }
      }
      for (const rel of relativos) {
        pendientes.push(resolve(archivo, "..", rel.replace(/\.js$/, ".ts")));
      }
    }

    expect(culpables).toEqual([]);
  });

  it("validaciones.ts NO importa nada, y por eso se puede probar", () => {
    // Es la regla que hace posible ejecutar las validaciones desde las
    // pruebas del frontend sin arrastrar nada al despliegue.
    const { relativos, paquetes } = importesDe(resolve(FUNCIONES, "validaciones.ts"));
    expect(paquetes).toEqual([]);
    expect(relativos).toEqual([]);
  });
});
