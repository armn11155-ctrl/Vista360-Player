import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * BOMBAS DE TIEMPO: coste que crece con la ANTIGÜEDAD del negocio.
 *
 * costeFirestore.test.ts vigila el coste de HOY (no duplicar escuchas,
 * no leer colecciones enteras). Esto vigila otra cosa: consultas cuyo
 * coste crece con los AÑOS aunque el uso diario no cambie.
 *
 * Son las más peligrosas porque no se notan al escribirlas. Una lista
 * "de solicitudes" con diez elementos funciona perfecto; la misma lista
 * a los cinco años tiene miles y se sigue leyendo entera en cada
 * sesión. Para cuando duele, ya está en producción y nadie recuerda por
 * qué se escribió así.
 */

const raiz = resolve(__dirname, "../..");
const HOOKS = resolve(__dirname, "../hooks");
const FUNCIONES = resolve(raiz, "functions/src");

function sinComentarios(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

const solicitudes = sinComentarios(readFileSync(resolve(HOOKS, "useSolicitudesCampana.ts"), "utf-8"));

describe("solicitudes de campaña: el historial no se lee entero", () => {
  it("NUNCA se consulta la colección sin filtrar", () => {
    // Esto era `query(collection(db, "solicitudesCampana"))` a secas.
    // Con 1.000 clientes y cinco años son ~100.000 documentos leídos en
    // cada apertura del admin: el doble de la cuota diaria gratuita
    // gastado por UNA sola sesión.
    expect(solicitudes).not.toMatch(
      /query\(\s*collection\(db!?,\s*"solicitudesCampana"\)\s*\)/
    );
  });

  it("toda consulta a solicitudesCampana lleva filtro por estado", () => {
    const consultas = solicitudes.match(/collection\(db!?,\s*"solicitudesCampana"\)/g) ?? [];
    expect(consultas.length).toBeGreaterThan(0);
    // Una consulta por estado: las pendientes y las ya resueltas.
    expect(solicitudes).toContain('where("estado", "==", "Pendiente")');
    expect(solicitudes).toContain('where("estado", "in"');
  });

  it("el historial ya resuelto está acotado por un límite", () => {
    // Las pendientes NO llevan límite a propósito (se vacían solas al
    // resolverlas, y ocultar trabajo sin atender sería peor). Lo que
    // crece para siempre es lo resuelto, y eso sí va acotado.
    expect(solicitudes).toMatch(/limit\(RESUELTAS_VISIBLES\)/);
    const tope = /RESUELTAS_VISIBLES\s*=\s*(\d+)/.exec(solicitudes);
    expect(tope, "RESUELTAS_VISIBLES debe ser un número literal").not.toBeNull();
    expect(Number(tope![1])).toBeGreaterThan(0);
    expect(Number(tope![1])).toBeLessThanOrEqual(200);
  });

  it("las dos escuchas se combinan sin pisarse", () => {
    // Cada onSnapshot llega por su cuenta. Si cada uno hiciera setState
    // con lo suyo, la lista parpadearía perdiendo la mitad de las filas.
    expect(solicitudes).toContain("if (pendientes === null || resueltas === null) return;");
    expect(solicitudes).toMatch(/\[\.\.\.pendientes,\s*\.\.\.resueltas\]/);
  });

  it("se cancelan las DOS escuchas al desmontar", () => {
    // Dejar una viva sigue cobrando cada cambio de la colección.
    expect(solicitudes).toMatch(/unsubPendientes\(\);\s*unsubResueltas\(\);/);
  });
});

describe("las consultas compuestas nuevas tienen su índice declarado", () => {
  const indices = JSON.parse(
    readFileSync(resolve(raiz, "firestore.indexes.json"), "utf-8"),
  ) as { indexes: Array<{ collectionGroup: string; fields: Array<{ fieldPath: string; order?: string }> }> };

  it("existe el índice para: estado + createdAt (solicitudesCampana)", () => {
    // where("estado","in",[...]) + orderBy("createdAt","desc") NO funciona
    // sin este índice: Firestore rechaza la consulta en producción y la
    // pantalla de solicitudes queda en error, aunque todo compile.
    const existe = indices.indexes.some(
      (i) =>
        i.collectionGroup === "solicitudesCampana" &&
        i.fields.length === 2 &&
        i.fields[0].fieldPath === "estado" &&
        i.fields[0].order === "ASCENDING" &&
        i.fields[1].fieldPath === "createdAt" &&
        i.fields[1].order === "DESCENDING",
    );
    expect(existe).toBe(true);
  });
});

describe("las funciones que recorren colecciones enteras declaran su tiempo", () => {
  // Estas cuatro leen colecciones completas o listan el bucket entero.
  // Su coste crece con TODO el histórico. No se puede evitar (son
  // recuentos globales), pero sí se puede evitar que mueran calladas: el
  // valor por defecto son 60 segundos, y al cortarse dejan el resultado
  // a medias sin explicar por qué.
  const PESADAS = [
    "limpiarArchivosHuerfanos",
    "resumenOcupacion",
    "contarEvidenciasHuerfanas",
    "obtenerEspacioR2",
  ];

  for (const nombre of PESADAS) {
    it(`${nombre} fija timeoutSeconds explícitamente`, () => {
      const codigo = sinComentarios(readFileSync(resolve(FUNCIONES, `${nombre}.ts`), "utf-8"));
      const t = /timeoutSeconds:\s*(\d+)/.exec(codigo);
      expect(t, `${nombre} usaría los 60 s por defecto`).not.toBeNull();
      expect(Number(t![1])).toBeGreaterThan(60);
      expect(Number(t![1])).toBeLessThanOrEqual(540);
    });
  }
});

describe("ninguna escucha nueva lee una colección entera en vivo", () => {
  // Red de seguridad para el futuro: cualquier hook que escuche una
  // colección que crece con el tiempo debe filtrarla o acotarla.
  const CRECEN_CON_EL_TIEMPO = ["contratos", "facturas", "informesCliente", "solicitudesCampana"];

  it("todas llevan where() o limit()", () => {
    const culpables: string[] = [];
    for (const f of readdirSync(HOOKS).filter((x) => x.endsWith(".ts") && !x.includes(".test."))) {
      const c = sinComentarios(readFileSync(resolve(HOOKS, f), "utf-8"));
      for (const col of CRECEN_CON_EL_TIEMPO) {
        const re = new RegExp(`query\\(\\s*collection\\(db!?,\\s*"${col}"\\)\\s*[,)]`);
        const m = re.exec(c);
        if (!m) continue;
        // Se mira el trozo de consulta que sigue a la colección.
        const trozo = c.slice(m.index, m.index + 400);
        if (!/where\(|limit\(/.test(trozo)) culpables.push(`${f} -> ${col}`);
      }
    }
    expect(culpables).toEqual([]);
  });
});
