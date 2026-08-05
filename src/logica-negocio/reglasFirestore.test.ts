import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readdirSync, statSync } from "node:fs";

/**
 * Las reglas de Firestore son la última línea de defensa: alguien puede
 * abrir la consola del navegador y llamar a Firestore con su sesión,
 * saltándose la app entera. Lo que permitan las reglas es lo que de
 * verdad se puede hacer.
 *
 * No se pueden compilar ni ejecutar sin credenciales del proyecto real,
 * así que estos tests no comprueban que FUNCIONEN -- comprueban que
 * sigan siendo COHERENTES con lo que el código hace. Que es donde se
 * rompen en la práctica: alguien agrega una colección o una escritura
 * nueva y nadie se acuerda de tocar las reglas.
 */

const raiz = resolve(__dirname, "../..");
const reglas = readFileSync(resolve(raiz, "firestore.rules"), "utf-8");

/** Todas las colecciones que el navegador toca, leídas del código. */
function coleccionesQueUsaElNavegador(): { lee: Set<string>; escribe: Set<string> } {
  const lee = new Set<string>();
  const escribe = new Set<string>();
  const ESCRITURAS = ["updateDoc", "setDoc", "addDoc", "deleteDoc"];

  const recorrer = (dir: string) => {
    for (const nombre of readdirSync(dir)) {
      const ruta = resolve(dir, nombre);
      if (statSync(ruta).isDirectory()) {
        if (nombre !== "node_modules") recorrer(ruta);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(nombre) || nombre.includes(".test.")) continue;
      const codigo = readFileSync(ruta, "utf-8");
      // Se ignoran los comentarios: varios explican migraciones pasadas
      // y mencionan addDoc/updateDoc sin usarlos.
      const sinComentarios = codigo
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n");

      for (const m of sinComentarios.matchAll(
        /(getDocs|getDoc|onSnapshot|updateDoc|setDoc|addDoc|deleteDoc)\s*\(/g
      )) {
        const ventana = sinComentarios.slice(Math.max(0, m.index! - 260), m.index! + 260);
        for (const c of ventana.matchAll(/(?:collection|doc)\(db!?,\s*"([a-zA-Z]+)"/g)) {
          (ESCRITURAS.includes(m[1]) ? escribe : lee).add(c[1]);
        }
      }
    }
  };
  recorrer(resolve(raiz, "src"));
  return { lee, escribe };
}

const uso = coleccionesQueUsaElNavegador();

describe("las reglas cubren lo que el navegador realmente hace", () => {
  it("el análisis del código encuentra colecciones (si no, el test no valdría nada)", () => {
    expect(uso.lee.size).toBeGreaterThan(4);
  });

  it("toda colección que el navegador LEE tiene su bloque de reglas", () => {
    const sinRegla = [...uso.lee].filter((c) => !reglas.includes(`match /${c}/`));
    // Si falta una, esa pantalla se quedaría sin datos al publicar las
    // reglas (el comodín final lo niega todo).
    expect(sinRegla).toEqual([]);
  });

  it("toda colección donde el navegador ESCRIBE tiene permiso explícito", () => {
    for (const col of uso.escribe) {
      const bloque = reglas.slice(reglas.indexOf(`match /${col}/`));
      const hasta = bloque.indexOf("match /", 10);
      const propio = hasta === -1 ? bloque : bloque.slice(0, hasta);
      expect(propio).toMatch(/allow (update|create|write)/);
    }
  });

  it("portalUsers NO acepta escritura del cliente (ahí vive el rol)", () => {
    const bloque = reglas.slice(reglas.indexOf("match /portalUsers/"));
    const propio = bloque.slice(0, bloque.indexOf("match /", 10));
    expect(propio).toContain("allow write: if false");
  });

  it("existe el cierre por defecto al final (una colección nueva queda negada)", () => {
    expect(reglas).toContain("match /{document=**}");
    const cierre = reglas.slice(reglas.indexOf("match /{document=**}"));
    expect(cierre).toContain("allow read, write: if false");
  });

  it("ninguna colección queda con lectura o escritura abierta a cualquiera", () => {
    // `if true` en una regla es casi siempre un descuido.
    expect(reglas).not.toMatch(/allow\s+(read|write|create|update|delete)[^:]*:\s*if\s+true/);
  });

  it("las escrituras que van por Cloud Function siguen cerradas en las reglas", () => {
    for (const col of ["contratos", "paneles", "clientes", "facturas", "invitacionesPortal"]) {
      const bloque = reglas.slice(reglas.indexOf(`match /${col}/`));
      const propio = bloque.slice(0, bloque.indexOf("match /", 10));
      expect(propio).toContain("allow write: if false");
    }
  });

  it("firebase.json apunta al archivo de reglas (si no, no se despliegan nunca)", () => {
    const cfg = JSON.parse(readFileSync(resolve(raiz, "firebase.json"), "utf-8"));
    expect(cfg.firestore?.rules).toBe("firestore.rules");
  });

  it("el despliegue de reglas NO es automático (debe pedirse a propósito)", () => {
    // Unas reglas mal puestas dejan a todos los clientes sin datos al
    // instante. No puede pasar por descuido al desplegar otra cosa.
    const wf = readFileSync(resolve(raiz, ".github/workflows/setup-r2-secrets-and-deploy.yml"), "utf-8");
    const i = wf.indexOf("--only firestore:rules");
    expect(i).toBeGreaterThan(-1);
    const paso = wf.slice(wf.lastIndexOf("- name:", i), i);
    expect(paso).toContain("if: ${{ inputs.desplegar_reglas }}");
  });
});
