import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Mantiene sincronizados el CÓDIGO y los ÍNDICES declarados.
 *
 * Las consultas de contratosDePaneles.ts combinan un filtro de panel con
 * uno de fecha, y esa combinación necesita un índice compuesto. Si
 * alguien cambia la consulta (otro campo, otro orden) y olvida tocar
 * firestore.indexes.json, Firestore rechaza la consulta EN PRODUCCION y
 * crear campañas deja de funcionar -- sin ningún aviso previo, porque
 * compila y los tests de lógica siguen pasando.
 *
 * Este test lee el código y el archivo de índices y comprueba que cada
 * consulta compuesta tenga su índice. Es el tipo de fallo que solo se
 * descubre con el cliente delante.
 */

const raiz = resolve(__dirname, "../..");
const codigo = readFileSync(resolve(raiz, "functions/src/contratosDePaneles.ts"), "utf-8");
const indices = JSON.parse(readFileSync(resolve(raiz, "firestore.indexes.json"), "utf-8")) as {
  indexes: Array<{
    collectionGroup: string;
    queryScope: string;
    fields: Array<{ fieldPath: string; order?: string; arrayConfig?: string }>;
  }>;
};

function existeIndice(coleccion: string, campos: Array<[string, string]>): boolean {
  return indices.indexes.some((idx) => {
    if (idx.collectionGroup !== coleccion) return false;
    if (idx.fields.length !== campos.length) return false;
    return campos.every(([ruta, tipo], i) => {
      const f = idx.fields[i];
      return f.fieldPath === ruta && (f.order ?? f.arrayConfig) === tipo;
    });
  });
}

describe("los índices declarados cubren las consultas del código", () => {
  it("el código sigue usando exactamente las dos consultas esperadas", () => {
    // Si esto falla, la consulta cambió: hay que revisar los índices.
    expect(codigo).toContain('.where("panel_ids", "array-contains", panelId)');
    expect(codigo).toContain('.where("panel_id", "==", panelId)');
    expect(codigo).toContain('.where("fin", ">=", inicio)');
  });

  it("existe el índice para: panel_ids (array) + fin", () => {
    expect(existeIndice("contratos", [["panel_ids", "CONTAINS"], ["fin", "ASCENDING"]])).toBe(true);
  });

  it("existe el índice para: panel_id + fin", () => {
    expect(existeIndice("contratos", [["panel_id", "ASCENDING"], ["fin", "ASCENDING"]])).toBe(true);
  });

  it("el campo de la desigualdad va SIEMPRE al final del índice", () => {
    // Firestore usa los campos de la izquierda para las igualdades y el
    // último para el rango. Al revés, el índice no sirve para la consulta
    // aunque el deploy lo acepte.
    for (const idx of indices.indexes.filter((i) => i.collectionGroup === "contratos")) {
      const ultimo = idx.fields[idx.fields.length - 1];
      expect(ultimo.fieldPath).toBe("fin");
    }
  });

  it("firebase.json apunta al archivo de índices (si no, no se despliegan)", () => {
    const firebaseJson = JSON.parse(readFileSync(resolve(raiz, "firebase.json"), "utf-8"));
    expect(firebaseJson.firestore?.indexes).toBe("firestore.indexes.json");
  });

  it("el despliegue publica los índices ANTES que las Cloud Functions", () => {
    // El orden es lo que evita que el código llegue antes que su índice.
    const wf = readFileSync(resolve(raiz, ".github/workflows/setup-r2-secrets-and-deploy.yml"), "utf-8");
    const posIndices = wf.indexOf("--only firestore:indexes");
    const posFunciones = wf.indexOf("--only functions:");
    expect(posIndices).toBeGreaterThan(-1);
    expect(posFunciones).toBeGreaterThan(-1);
    expect(posIndices).toBeLessThan(posFunciones);
  });

  it("PELIGRO: el deploy de índices NO puede llevar --force (borraría los que no estén en el archivo)", () => {
    // firebase-tools hace `shouldDeleteIndexes = options.force`: con
    // --force borra TODO índice que exista en el proyecto y no esté en
    // firestore.indexes.json. Este proyecto tiene índices creados por
    // otras vías (scripts/create-informes-index-direct.mjs) y puede
    // tener otros hechos a mano desde la consola. Con --force, un
    // despliegue rutinario los borraría y rompería pantallas que hoy
    // funcionan, sin que nadie relacionara la causa con el efecto.
    const wf = readFileSync(resolve(raiz, ".github/workflows/setup-r2-secrets-and-deploy.yml"), "utf-8");
    const inicio = wf.indexOf("- name: Desplegar índices de Firestore");
    expect(inicio).toBeGreaterThan(-1);
    const finPaso = wf.indexOf("- name:", inicio + 10);
    const paso = wf.slice(inicio, finPaso === -1 ? undefined : finPaso);
    // Se quitan los comentarios: este mismo paso EXPLICA en un comentario
    // por qué no lleva --force, y esa mención no debe contar como uso.
    const comandos = paso
      .split("\n")
      .filter((l) => !l.trim().startsWith("#"))
      .join(" ");
    expect(comandos).toContain("--only firestore:indexes");
    expect(comandos).not.toContain("--force");
  });

  it("los índices que ya existían por otras vías están declarados (si no, se avisaría de borrarlos)", () => {
    // El de informesCliente lo crea create-informes-index-direct.mjs.
    // Declararlo acá mantiene el archivo fiel a la realidad del
    // proyecto; la CLI lo detecta como existente y no hace nada.
    expect(existeIndice("informesCliente", [["cliente_id", "ASCENDING"], ["mes", "DESCENDING"]])).toBe(true);
  });

  it("el código tiene respaldo por si el índice no está disponible", () => {
    // Sin esto, un índice a medio construir dejaría al equipo sin poder
    // crear campañas.
    expect(codigo).toContain("esFaltaDeIndice");
    expect(codigo).toContain("if (!esFaltaDeIndice(error)) throw error;");
  });
});
