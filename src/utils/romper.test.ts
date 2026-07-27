import { describe, it, expect } from "vitest";
import { diasHasta, fechaCorta, fechaLarga, progresoCampana, soloFecha, sumarDias, sumarMeses } from "./fechas";
import { estadoCampana, modalidadDePanel, esPanelExclusivo } from "../types";
import { mensajeDeError } from "./errores";
import type { Contrato } from "../types";

/**
 * Ataque deliberado: datos basura, vacíos, gigantes, del futuro lejano y
 * malformados. Nada de esto debería lanzar una excepción -- si una de
 * estas funciones explota durante el render, se lleva la pantalla entera.
 */

const BASURA = [
  "", " ", "null", "undefined", "0000-00-00", "9999-99-99", "abc",
  "2026", "2026-13-45", "2026-02-30", "-2026-07-31", "2026/07/31",
  "2026-07-31T99:99:99", "٢٠٢٦-٠٧-٣١", "2026-07-31 ",
  "<script>alert(1)</script>", "'; DROP TABLE--", "0".repeat(500),
];

describe("fechas: no explotan con basura", () => {
  it.each(BASURA)("soloFecha(%j)", (v) => {
    expect(() => soloFecha(v)).not.toThrow();
  });
  it.each(BASURA)("fechaCorta(%j)", (v) => {
    expect(() => fechaCorta(v)).not.toThrow();
    expect(typeof fechaCorta(v)).toBe("string");
  });
  it.each(BASURA)("fechaLarga(%j)", (v) => {
    expect(() => fechaLarga(v)).not.toThrow();
  });
  it.each(BASURA)("diasHasta(%j)", (v) => {
    expect(() => diasHasta(v)).not.toThrow();
    expect(Number.isFinite(diasHasta(v))).toBe(true);
  });
  it.each(BASURA)("sumarDias(%j)", (v) => {
    expect(() => sumarDias(v, 30)).not.toThrow();
  });
  it.each(BASURA)("sumarMeses(%j)", (v) => {
    expect(() => sumarMeses(v, 3)).not.toThrow();
  });
  it("null / undefined", () => {
    expect(() => soloFecha(null)).not.toThrow();
    expect(() => fechaCorta(undefined)).not.toThrow();
    expect(() => fechaLarga(null)).not.toThrow();
  });
});

describe("progresoCampana devuelve siempre un porcentaje válido", () => {
  const casos: [string, string, string][] = [
    ["2026-07-01", "2026-07-31", "2026-07-15"],
    ["2026-07-31", "2026-07-01", "2026-07-15"],
    ["2026-07-01", "2026-07-01", "2026-07-01"],
    ["", "", ""],
    ["basura", "peor", "aun peor"],
    ["2026-07-01", "9999-12-31", "2026-07-15"],
  ];
  it.each(casos)("inicio=%j fin=%j hoy=%j", (i, f, h) => {
    const p = progresoCampana(i, f, h);
    expect(Number.isFinite(p)).toBe(true);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(100);
  });
});

describe("estadoCampana nunca lanza", () => {
  const VALIDOS = ["Activa", "Programada", "Finalizada"];
  it.each(BASURA)("fechas basura (%j)", (v) => {
    const c = { id: "x", inicio: v, fin: v } as unknown as Contrato;
    expect(() => estadoCampana(c)).not.toThrow();
    expect(VALIDOS).toContain(estadoCampana(c));
  });
  it("campos ausentes", () => {
    expect(() => estadoCampana({} as unknown as Contrato)).not.toThrow();
  });
});

describe("modalidad de panel resiste datos raros", () => {
  const RAROS = ["", "LED LONA", "lona led", "LeD", "MURAL DIGITAL", "0".repeat(300)];
  it.each(RAROS)("tipo=%j", (t) => {
    expect(() => modalidadDePanel({ tipo: t })).not.toThrow();
    expect(["led", "lona"]).toContain(modalidadDePanel({ tipo: t }));
    expect(typeof esPanelExclusivo({ tipo: t })).toBe("boolean");
  });
  it("tipo nulo o ausente", () => {
    expect(modalidadDePanel({ tipo: undefined as unknown as string })).toBe("led");
    expect(modalidadDePanel({ tipo: null as unknown as string })).toBe("led");
  });
});

describe("mensajeDeError siempre devuelve texto legible", () => {
  const ERRORES: unknown[] = [
    null, undefined, 0, false, "", [], {}, { code: 123 }, { message: 42 },
    new Error(""), new Error("x"),
    { code: "functions/permission-denied" },
  ];
  it.each(ERRORES.map((e, i) => [i, e] as const))("error #%i", (_i, e) => {
    expect(() => mensajeDeError(e, "Respaldo.")).not.toThrow();
    const r = mensajeDeError(e, "Respaldo.");
    expect(typeof r).toBe("string");
    expect(r.length).toBeGreaterThan(0);
  });
});
