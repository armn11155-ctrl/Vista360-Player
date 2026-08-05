import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Vigilancia del COSTE de Firestore.
 *
 * En Firebase se paga por documento leído, y las escuchas en vivo
 * (onSnapshot) cobran la carga inicial y otra vez con cada cambio. Con
 * pocos clientes no se nota; con muchos, un listener de más o una
 * consulta sin filtro se convierten en la mayor parte de la factura.
 *
 * Estos tests no miden el gasto -- fijan las decisiones que lo
 * contienen, para que no se deshagan sin querer. Es el tipo de cosa que
 * se degrada sola: alguien añade un hook que "solo necesita los
 * contratos" y duplica una escucha que ya existía.
 */

const HOOKS = resolve(__dirname, "../hooks");

function hook(nombre: string): string {
  return readFileSync(resolve(HOOKS, `${nombre}.ts`), "utf-8");
}

/** Código sin comentarios: varios explican optimizaciones pasadas y
 *  mencionan las consultas que precisamente ya NO se hacen. */
function sinComentarios(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

describe("no duplicar escuchas sobre la misma colección", () => {
  it("solo UN hook escucha los contratos de un cliente", () => {
    // useNotificaciones tenía su propia escucha con la MISMA consulta
    // que useContratos: cada sesión leía las campañas dos veces, y las
    // volvía a pagar dos veces con cada cambio.
    const conEscuchaDeContratos = readdirSync(HOOKS)
      .filter((f) => f.endsWith(".ts") && !f.includes(".test."))
      .filter((f) => {
        const c = sinComentarios(readFileSync(resolve(HOOKS, f), "utf-8"));
        return /collection\(db!?,\s*"contratos"\)/.test(c) && /where\("cliente_id"/.test(c);
      });
    expect(conEscuchaDeContratos).toEqual(["useContratos.ts"]);
  });

  it("useNotificaciones recibe los contratos, no los consulta", () => {
    const c = sinComentarios(hook("useNotificaciones"));
    expect(c).toContain("contratos: Contrato[]");
    expect(c).not.toMatch(/collection\(db!?,\s*"contratos"\)/);
  });
});

describe("ninguna escucha lee una colección entera sin filtrar", () => {
  const SIN_FILTRO_ACEPTABLE = new Set([
    // El inventario de paneles es global y acotado por el negocio (son
    // los soportes físicos que existen), no crece con clientes ni años.
    "usePanelesDisponibles.ts",
  ]);

  it("las escuchas sobre colecciones que crecen llevan filtro", () => {
    const sinFiltro: string[] = [];
    for (const f of readdirSync(HOOKS).filter((x) => x.endsWith(".ts") && !x.includes(".test."))) {
      if (SIN_FILTRO_ACEPTABLE.has(f)) continue;
      const c = sinComentarios(readFileSync(resolve(HOOKS, f), "utf-8"));
      // onSnapshot(collection(...)) directo, sin query() alrededor.
      if (/onSnapshot\(\s*collection\(db!?,\s*"(contratos|facturas|informesCliente|solicitudesCampana)"\)/.test(c)) {
        sinFiltro.push(f);
      }
    }
    expect(sinFiltro).toEqual([]);
  });

  it("el conteo de campañas activas descarta el historial ya cerrado", () => {
    // Antes leía TODOS los contratos que hubieran existido para contar
    // los activos de hoy: una cuenta que solo crece con los años.
    const c = sinComentarios(hook("useCampanasActivasPorCliente"));
    expect(c).toContain('where("fin", ">=", hoyEnPeru())');
  });
});

describe("las listas del administrador no crecen sin techo", () => {
  it("la lista de invitaciones sigue acotada", () => {
    expect(sinComentarios(hook("useInvitaciones"))).toMatch(/limit\(\d+\)/);
  });
});

describe("facturas: una sola consulta, no dos", () => {
  it("useFacturas ya no consulta por RUC", () => {
    // Antes lanzaba DOS escuchas (por cliente_doc y por cliente_id) y
    // fusionaba quitando duplicados: cada factura se leía y se pagaba
    // dos veces. Verificado contra los datos reales que la consulta por
    // RUC no aportaba ninguna factura que la otra no trajera ya.
    const c = sinComentarios(hook("useFacturas"));
    expect(c).not.toContain('where("cliente_doc"');
    expect(c).toContain('where("cliente_id", "==", clienteId)');
  });

  it("solo queda UNA escucha sobre facturas", () => {
    const c = sinComentarios(hook("useFacturas"));
    expect((c.match(/onSnapshot\(/g) ?? []).length).toBe(1);
  });
});

describe("reutilizar lo que ya está en memoria", () => {
  it("usePaneles se sirve del inventario cargado antes de pedir a Firestore", () => {
    // La app carga el inventario completo al arrancar (1 lectura). Antes
    // este hook lo ignoraba y pedía cada panel por separado: en una
    // sesión normal, 8 lecturas para datos que ya estaban delante.
    const c = sinComentarios(hook("usePaneles"));
    expect(c).toContain("panelesEnMemoria()");
    expect(c).toContain("faltan");
  });

  it("...pero sigue pudiendo pedir los que falten (no se rompe si no está en memoria)", () => {
    const c = sinComentarios(hook("usePaneles"));
    expect(c).toContain("getDoc(");
  });

  it("el inventario se lee de UN documento agregado, no de la colección", () => {
    const c = sinComentarios(hook("usePanelesDisponibles"));
    expect(c).toContain('doc(db!, "agregados", "paneles")');
  });

  it("...con respaldo a la colección si ese documento aún no existe", () => {
    const c = sinComentarios(hook("usePanelesDisponibles"));
    expect(c).toContain("escucharColeccionDirecta");
  });
});
