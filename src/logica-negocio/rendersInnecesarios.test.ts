import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * BARRIDO AUTOMÁTICO contra bucles de renderizado.
 *
 * buclesDeRender.test.ts vigila los sitios CONCRETOS donde ya hubo un
 * fallo. Esto es lo contrario: recorre TODO src/ buscando el patrón allá
 * donde aparezca, incluso en archivos que todavía no existen.
 *
 * EL PATRÓN: un valor creado durante el render --filter, map, sort,
 * reduce, Object.values/keys/entries, new Set/Map, spreads, literales
 * `[]` y `{}`-- que acaba en las dependencias de un useEffect, useMemo o
 * useCallback sin memoizar.
 *
 * POR QUÉ IMPORTA TANTO: no da ningún síntoma. No hay error, no hay
 * pantalla rota, el DOM ni se mueve (React re-renderiza y produce lo
 * mismo). Lo único que se rompe son las TRANSICIONES de React, que al
 * ser interrumpibles nunca llegan a completarse. En la práctica: pulsas
 * un botón de navegación y no pasa nada, mientras el menú lateral --que
 * no usa transición-- sigue funcionando perfectamente.
 *
 * Se midió en producción: bloqueos de 674 ms y 749 ms del hilo principal
 * con CERO mutaciones del DOM. Costó un día entero encontrarlo.
 */

const RAIZ = resolve(__dirname, "../..");

interface Hallazgo {
  archivo: string;
  dependencia?: string;
  hook?: string;
  motivo: string;
  creadoEnLinea?: number;
  linea?: number;
  codigo?: string;
  argumentos?: string;
}

function analizar(): { hallazgos: Hallazgo[]; argumentosEnLinea: Hallazgo[]; parametrosEnDeps: unknown[] } {
  const salida = execFileSync("node", [resolve(RAIZ, "scripts/detectar-renders.mjs"), "--json"], {
    encoding: "utf-8",
    cwd: RAIZ,
  });
  return JSON.parse(salida);
}

const informe = analizar();

function describir(h: Hallazgo): string {
  return `${h.archivo}:${h.creadoEnLinea ?? h.linea} [${h.motivo}] ${h.dependencia ?? h.hook} -> ${h.codigo ?? h.argumentos}`;
}

describe("ningún valor creado en el render llega a un array de dependencias", () => {
  it("no hay referencias nuevas usadas como dependencia", () => {
    expect(informe.hallazgos.map(describir)).toEqual([]);
  });

  it("tampoco pasadas en línea dentro de la propia llamada al hook", () => {
    // Este es el caso que rompió la navegación: App.tsx tenía
    // `const contratos = ...filter(...)` y se lo pasaba a
    // useNotificaciones, que lo usa como dependencia de su efecto.
    expect(informe.argumentosEnLinea.map(describir)).toEqual([]);
  });
});

describe("el detector sirve de algo", () => {
  // Un test que solo comprueba "no hay hallazgos" pasa igual de bien si
  // el detector esta roto. Estos comprueban que SI encuentra el patron.
  const { execFileSync: ejecutar } = require("node:child_process") as typeof import("node:child_process");

  function analizarTexto(codigo: string): number {
    // Se analiza un archivo temporal dentro de src/ para que el detector
    // lo recorra igual que a los demas.
    const { writeFileSync, unlinkSync } = require("node:fs") as typeof import("node:fs");
    const ruta = resolve(RAIZ, "src/__prueba-detector.tsx");
    writeFileSync(ruta, codigo, "utf-8");
    try {
      const salida = ejecutar("node", [resolve(RAIZ, "scripts/detectar-renders.mjs"), "--json"], {
        encoding: "utf-8",
        cwd: RAIZ,
      });
      const r = JSON.parse(salida);
      return [...r.hallazgos, ...r.argumentosEnLinea].filter(
        (h: Hallazgo) => h.archivo.includes("__prueba-detector"),
      ).length;
    } finally {
      unlinkSync(ruta);
    }
  }

  it("detecta un filter() usado como dependencia", () => {
    expect(
      analizarTexto(`export function useX(lista: string[]) {
  const filtrada = lista.filter((x) => x !== "");
  useEffect(() => { console.log(filtrada); }, [filtrada]);
}`),
    ).toBeGreaterThan(0);
  });

  it("detecta un `: []` en un ternario", () => {
    expect(
      analizarTexto(`export function useY(estado: { ok: boolean; lista: string[] }) {
  const cosas = estado.ok ? estado.lista : [];
  useEffect(() => { console.log(cosas); }, [cosas]);
}`),
    ).toBeGreaterThan(0);
  });

  it("detecta Object.values(), new Set() y spreads", () => {
    for (const expr of ["Object.values(mapa)", "new Set(lista)", "[...lista]", "{ ...objeto }"]) {
      expect(
        analizarTexto(`export function useZ(mapa: Record<string, string>, lista: string[], objeto: object) {
  const derivado = ${expr};
  useEffect(() => { console.log(derivado); }, [derivado]);
}`),
        `no detectó ${expr}`,
      ).toBeGreaterThan(0);
    }
  });

  it("NO se queja de un primitivo (join, length, Boolean)", () => {
    // `.map(...).join("|")` es el patrón CORRECTO para meter una lista en
    // un array de dependencias: los primitivos se comparan por valor.
    for (const expr of ['lista.map((x) => x).join("|")', "lista.length", "Boolean(lista[0])"]) {
      expect(
        analizarTexto(`export function useW(lista: string[]) {
  const clave = ${expr};
  useEffect(() => { console.log(clave); }, [clave]);
}`),
        `falso positivo con ${expr}`,
      ).toBe(0);
    }
  });

  it("NO se queja de algo ya envuelto en useMemo", () => {
    expect(
      analizarTexto(`export function useV(lista: string[]) {
  const filtrada = useMemo(() => lista.filter((x) => x !== ""), [lista]);
  useEffect(() => { console.log(filtrada); }, [filtrada]);
}`),
    ).toBe(0);
  });
});
