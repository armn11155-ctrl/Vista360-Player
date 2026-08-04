import { describe, expect, it } from "vitest";
import { estadoDesdeActivos, sumarUnDia } from "../../functions/src/estadoPaneles";
import { cuposPanel } from "../types";

/**
 * estadoDesdeActivos() es LA regla de ocupación de todo el negocio: a
 * partir de las campañas vigentes hoy en un panel y de cuántos cupos
 * tiene ese soporte, decide si está lleno y desde cuándo se libera uno.
 *
 * Vive en functions/ (backend) y la usan DOS caminos distintos:
 *   - recalcularEstadoPaneles(), al crear/editar/borrar una campaña;
 *   - sincronizarEstadoPaneles(), el barrido diario de todo el inventario.
 * Se comparte a propósito para que no puedan desalinearse entre sí. De
 * lo que decide acá sale el campo `estado` del panel, que es lo que
 * pinta los pines del mapa y lo que bloquea contratar un panel lleno.
 *
 * No tenía ni un test, siendo la pieza donde un error se traduce
 * directamente en vender dos veces el mismo espacio físico.
 *
 * Se importa desde functions/ a propósito: probar la copia real que
 * corre en producción, no una reimplementación que podría divergir.
 */

describe("sumarUnDia — un soporte se libera al DÍA SIGUIENTE de terminar", () => {
  it("suma un día normal", () => {
    expect(sumarUnDia("2026-08-04")).toBe("2026-08-05");
  });

  it("cruza bien el fin de mes", () => {
    expect(sumarUnDia("2026-08-31")).toBe("2026-09-01");
  });

  it("cruza bien el fin de año", () => {
    expect(sumarUnDia("2026-12-31")).toBe("2027-01-01");
  });

  it("maneja el 29 de febrero de un año bisiesto", () => {
    expect(sumarUnDia("2028-02-28")).toBe("2028-02-29");
    expect(sumarUnDia("2028-02-29")).toBe("2028-03-01");
  });

  it("en un año NO bisiesto, febrero salta directo a marzo", () => {
    expect(sumarUnDia("2026-02-28")).toBe("2026-03-01");
  });

  it("no explota con basura: devuelve la entrada tal cual", () => {
    expect(sumarUnDia("")).toBe("");
    expect(sumarUnDia("no-es-fecha")).toBe("no-es-fecha");
  });
});

describe("estadoDesdeActivos — soportes EXCLUSIVOS (mural, lona, paradero: 1 cupo)", () => {
  it("sin campañas, está libre", () => {
    expect(estadoDesdeActivos(1, [])).toEqual({ ocupado: false, libreDesde: null });
  });

  it("con una campaña vigente, está lleno y se libera al día siguiente de que termine", () => {
    expect(estadoDesdeActivos(1, ["2026-08-31"])).toEqual({
      ocupado: true,
      libreDesde: "2026-09-01",
    });
  });

  it("si por error hubiera dos campañas a la vez, se libera cuando termine la ÚLTIMA", () => {
    // Con 1 cupo y 2 activas hay que esperar a que se vayan las dos
    // menos una... es decir, a la más lejana. Devolver la más cercana
    // ofrecería el panel antes de tiempo.
    expect(estadoDesdeActivos(1, ["2026-08-31", "2026-12-31"])).toEqual({
      ocupado: true,
      libreDesde: "2027-01-01",
    });
  });
});

describe("estadoDesdeActivos — UNIPOLAR (2 caras = 2 cupos)", () => {
  it("con una sola cara ocupada, todavía se puede contratar", () => {
    expect(estadoDesdeActivos(2, ["2026-08-31"])).toEqual({ ocupado: false, libreDesde: null });
  });

  it("con las dos caras ocupadas, está lleno", () => {
    const r = estadoDesdeActivos(2, ["2026-08-31", "2026-12-31"]);
    expect(r.ocupado).toBe(true);
  });

  it("lleno: se libera cuando termina la PRIMERA de las dos, no la última", () => {
    // Este es el punto delicado: basta con que se desocupe UNA cara para
    // volver a tener cupo. Devolver la fecha más lejana dejaría el
    // panel marcado como ocupado meses de más -- espacio vendible
    // perdido sin que nadie se entere.
    expect(estadoDesdeActivos(2, ["2026-12-31", "2026-08-31"])).toEqual({
      ocupado: true,
      libreDesde: "2026-09-01",
    });
  });

  it("da igual el orden en que lleguen las fechas", () => {
    const a = estadoDesdeActivos(2, ["2026-08-31", "2026-12-31"]);
    const b = estadoDesdeActivos(2, ["2026-12-31", "2026-08-31"]);
    expect(a).toEqual(b);
  });

  it("con tres campañas en un panel de 2 cupos, se libera cuando termine la 2ª más cercana", () => {
    // Sobra una: hay que esperar a bajar de 3 a 2 activas.
    expect(estadoDesdeActivos(2, ["2026-08-31", "2026-09-30", "2026-12-31"])).toEqual({
      ocupado: true,
      libreDesde: "2026-10-01",
    });
  });
});

describe("estadoDesdeActivos — LED (rota anuncios: cupos infinitos)", () => {
  it("nunca se llena, por más campañas que tenga", () => {
    expect(estadoDesdeActivos(Infinity, [])).toEqual({ ocupado: false, libreDesde: null });
    expect(estadoDesdeActivos(Infinity, ["2026-08-31"])).toEqual({ ocupado: false, libreDesde: null });
    expect(
      estadoDesdeActivos(Infinity, ["2026-08-31", "2026-09-30", "2026-12-31", "2027-01-01"])
    ).toEqual({ ocupado: false, libreDesde: null });
  });
});

describe("integración con cuposPanel: el tipo de soporte decide el aforo", () => {
  const casos = [
    { tipo: "Mural", cuposEsperados: 1 },
    { tipo: "Paradero", cuposEsperados: 1 },
    { tipo: "Unipolar", cuposEsperados: 2 },
  ] as const;

  it.each(casos)("un $tipo con TODOS sus cupos tomados queda ocupado", ({ tipo, cuposEsperados }) => {
    const cupos = cuposPanel({ tipo } as never);
    expect(cupos).toBe(cuposEsperados);
    const fines = Array.from({ length: cupos }, (_, i) => `2026-0${8 + i}-28`);
    expect(estadoDesdeActivos(cupos, fines).ocupado).toBe(true);
  });

  it.each(casos)("un $tipo con un cupo libre NO queda ocupado", ({ tipo }) => {
    const cupos = cuposPanel({ tipo } as never);
    const fines = Array.from({ length: cupos - 1 }, (_, i) => `2026-0${8 + i}-28`);
    expect(estadoDesdeActivos(cupos, fines).ocupado).toBe(false);
  });

  it("un LED nunca se marca ocupado aunque tenga muchas campañas", () => {
    const cupos = cuposPanel({ tipo: "LED" } as never);
    expect(Number.isFinite(cupos)).toBe(false);
    expect(estadoDesdeActivos(cupos, ["2026-08-31", "2026-09-30"]).ocupado).toBe(false);
  });
});

describe("invariantes que no se pueden romper nunca", () => {
  const escenarios: Array<{ cupos: number; fines: string[] }> = [
    { cupos: 1, fines: [] },
    { cupos: 1, fines: ["2026-08-31"] },
    { cupos: 2, fines: ["2026-08-31"] },
    { cupos: 2, fines: ["2026-08-31", "2026-12-31"] },
    { cupos: 2, fines: ["2026-08-31", "2026-09-30", "2026-12-31"] },
    { cupos: Infinity, fines: ["2026-08-31", "2026-12-31"] },
  ];

  it.each(escenarios)("cupos=$cupos: si NO está ocupado, no promete fecha de liberación", ({ cupos, fines }) => {
    const r = estadoDesdeActivos(cupos, fines);
    if (!r.ocupado) expect(r.libreDesde).toBeNull();
  });

  it.each(escenarios)("cupos=$cupos: si está ocupado, siempre dice desde cuándo se libera", ({ cupos, fines }) => {
    const r = estadoDesdeActivos(cupos, fines);
    if (r.ocupado) expect(r.libreDesde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it.each(escenarios)("cupos=$cupos: la fecha de liberación es POSTERIOR a alguna campaña vigente", ({ cupos, fines }) => {
    const r = estadoDesdeActivos(cupos, fines);
    if (r.ocupado && r.libreDesde) {
      // Nunca puede liberarse antes de que termine la campaña más cercana.
      const masCercana = [...fines].sort()[0];
      expect(r.libreDesde > masCercana).toBe(true);
    }
  });

  it("estar ocupado depende solo de cuántas campañas hay frente al aforo", () => {
    // Menos campañas que cupos => libre, siempre.
    expect(estadoDesdeActivos(2, ["2026-08-31"]).ocupado).toBe(false);
    // Tantas como cupos => lleno, siempre.
    expect(estadoDesdeActivos(2, ["2026-08-31", "2026-09-30"]).ocupado).toBe(true);
  });
});
