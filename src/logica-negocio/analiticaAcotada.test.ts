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

  it("TODO getDocs que se ejecuta lleva limit", () => {
    // El invariante correcto no es "ninguna query sin limit": la consulta
    // base se compone y se le añade el limit despues. Lo que importa es
    // que nada se EJECUTE sin acotar.
    const ejecuciones = [...hook.matchAll(/getDocs\(([\s\S]{0,300}?)\)\s*;/g)].map((m) => m[1]);
    expect(ejecuciones.length).toBeGreaterThan(0);
    for (const e of ejecuciones) {
      expect(e, `getDocs sin limit: ${e.slice(0, 80)}`).toContain("limit(");
    }
    // Y la base nunca se ejecuta tal cual.
    expect(hook).not.toMatch(/getDocs\(consultaBase\)/);
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
  it("si falta el indice, la pantalla NO se rompe", () => {
    /**
     * PASO DE VERDAD, y por eso existe esta prueba.
     *
     * El frontend con orderBy("lastLogin","desc") se publico ANTES que el
     * indice compuesto -- Cloudflare despliega el frontend y los indices
     * van por otro camino. Firestore contesto "The query requires an
     * index" y la pantalla de Analitica quedo inservible en produccion.
     *
     * La ventana entre un despliegue y otro es inevitable; que la
     * pantalla muera durante esa ventana, no.
     */
    expect(hook).toContain("failed-precondition");
    // El respaldo mantiene el limit: el coste sigue acotado aunque se
    // pierda el orden por actividad.
    const respaldo = hook.slice(hook.indexOf("failed-precondition"));
    expect(respaldo).toContain("limit(POR_PAGINA)");
    // Y solo se cae al respaldo por falta de indice: cualquier otro error
    // (permisos, red) debe seguir propagandose.
    expect(hook).toContain("if (!String(codigo).includes(\"failed-precondition\")) throw error;");
  });

});
