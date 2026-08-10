import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * BOMBA DE TIEMPO DESACTIVADA: la analitica era O(n) en clientes.
 *
 * `useAccesosClientes` pedia portalUsers filtrando por role == "cliente"
 * SIN limit: una lectura por cuenta cada vez que vencia la cache.
 *
 *      100 clientes ->      100 lecturas por apertura
 *    1.000 clientes ->    1.000 lecturas
 *   10.000 clientes ->   10.000 lecturas  (la cuota diaria gratuita
 *                                          entera, desde UNA pantalla)
 *
 * Ahora: 300 por pagina + el total con getCountFromServer, que Firestore
 * cobra a 1 lectura por cada 1.000 documentos contados.
 *
 *   10.000 clientes -> 300 + 10 = 310 lecturas, y no sube nunca mas.
 */
const RAIZ = resolve(__dirname, "../..");
const leer = (f: string) => readFileSync(resolve(RAIZ, f), "utf-8");
const hook = leer("src/hooks/useAccesosClientes.ts");

describe("la analitica no puede volver a leer una ficha por cliente", () => {
  it("la consulta lleva limit y orden por actividad", () => {
    expect(hook).toContain('orderBy("lastLogin", "desc")');
    expect(hook).toContain("limit(POR_PAGINA)");
    expect(hook).toContain("const POR_PAGINA = 300;");
  });

  it("el total se pide contando, no descargando", () => {
    // getCountFromServer cuesta 1 lectura por cada 1.000 documentos.
    expect(hook).toContain("getCountFromServer(");
  });

  it("no queda ninguna consulta a portalUsers sin limit", () => {
    // La red de seguridad de verdad: si alguien reintroduce un getDocs
    // sin acotar sobre portalUsers, esto falla.
    const consultas = [...hook.matchAll(/query\(\s*collection\([^)]*"portalUsers"\)[\s\S]*?\)\s*\)/g)];
    expect(consultas.length).toBeGreaterThan(0);
    for (const c of consultas) {
      const texto = c[0];
      const esConteo = texto.includes("getCountFromServer") || hook.slice(Math.max(0, c.index! - 40), c.index!).includes("getCountFromServer");
      if (esConteo) continue;
      expect(texto, "consulta a portalUsers sin limit").toContain("limit(");
    }
  });

  it("el numero que se muestra es el REAL, no el de lo descargado", () => {
    // Sin esto, con 5.000 clientes la pantalla diria "300 clientes".
    const pantalla = leer("src/components/screens/AnaliticaClientes.tsx");
    expect(pantalla).toContain("total: state.total");
    expect(pantalla).not.toContain("total: state.accesos.length");
  });

  it("se avisa cuando hay mas clientes de los que se ven", () => {
    const pantalla = leer("src/components/screens/AnaliticaClientes.tsx");
    expect(pantalla).toContain("state.hayMas");
    expect(pantalla).toContain("actividad más reciente");
  });

  it("una cuenta nueva no desaparece de la analitica", () => {
    // orderBy DESCARTA los documentos sin ese campo. Una cuenta que nunca
    // inicio sesion no tendria lastLogin y se caeria de la lista -- justo
    // la que mas se busca en una analitica de accesos. Un null SI se
    // indexa, asi que aparece desde el primer dia.
    const crear = leer("functions/src/crearClienteAcceso.ts");
    expect(crear).toContain("lastLogin: null");
  });

  it("existe el indice compuesto que la consulta necesita", () => {
    // Sin el, Firestore rechaza la consulta en produccion aunque
    // TypeScript compile y los tests pasen.
    const indices = JSON.parse(leer("firestore.indexes.json"));
    const tiene = indices.indexes.some(
      (i: { collectionGroup: string; fields: { fieldPath: string; order?: string }[] }) =>
        i.collectionGroup === "portalUsers" &&
        i.fields.some((f) => f.fieldPath === "role") &&
        i.fields.some((f) => f.fieldPath === "lastLogin" && f.order === "DESCENDING")
    );
    expect(tiene).toBe(true);
  });
});
