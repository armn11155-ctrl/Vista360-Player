import { describe, it, expect, vi, afterEach } from "vitest";
import { diasHasta, hoyEnPeru, progresoCampana, soloFecha, sumarDias, sumarMeses } from "./fechas";
import { estadoCampana } from "../types";
import type { Contrato } from "../types";

/**
 * Estas pruebas existen por un bug real: las campañas se mostraban como
 * "Finalizada" casi 29 horas antes de terminar de verdad. La causa era
 * `new Date("2026-07-31")`, que JS interpreta como medianoche UTC — o
 * sea, el 30 de julio a las 7 p.m. en Perú. Cualquier cambio futuro que
 * vuelva a meter objetos Date en esta comparación debería romper acá.
 */

const contrato = (inicio: string, fin: string) =>
  ({ id: "c1", inicio, fin } as unknown as Contrato);

/** Fija el reloj del sistema a un instante real de Lima. */
function enLima(fechaHoraLima: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${fechaHoraLima}-05:00`));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("hoyEnPeru", () => {
  it("da el día de Lima, no el de UTC, en la noche", () => {
    // 20:00 en Lima = 01:00 UTC del día SIGUIENTE.
    enLima("2026-07-30T20:00:00");
    expect(hoyEnPeru()).toBe("2026-07-30");
  });

  it("da el día de Lima justo pasada la medianoche", () => {
    enLima("2026-07-31T00:05:00");
    expect(hoyEnPeru()).toBe("2026-07-31");
  });
});

describe("estadoCampana", () => {
  const julio = contrato("2026-07-01", "2026-07-31");

  it("es Programada antes de empezar", () => {
    expect(estadoCampana(julio, "2026-06-30")).toBe("Programada");
  });

  it("es Activa el primer día", () => {
    expect(estadoCampana(julio, "2026-07-01")).toBe("Activa");
  });

  it("SIGUE Activa el último día — este era el bug", () => {
    expect(estadoCampana(julio, "2026-07-31")).toBe("Activa");
  });

  it("recién es Finalizada al día siguiente del fin", () => {
    expect(estadoCampana(julio, "2026-08-01")).toBe("Finalizada");
  });

  it("no se adelanta por la tarde/noche del penúltimo día", () => {
    // El caso exacto que reportó el usuario.
    enLima("2026-07-30T20:00:00");
    expect(estadoCampana(julio)).toBe("Activa");
  });

  it("se mantiene Activa a cualquier hora del último día", () => {
    for (const hora of ["00:01", "08:00", "13:30", "19:00", "23:59"]) {
      enLima(`2026-07-31T${hora}:00`);
      expect(estadoCampana(julio)).toBe("Activa");
      vi.useRealTimers();
    }
  });
});

describe("diasHasta", () => {
  it("da 0 el mismo día", () => {
    expect(diasHasta("2026-07-31", "2026-07-31")).toBe(0);
  });

  it("da 1 para mañana", () => {
    expect(diasHasta("2026-08-01", "2026-07-31")).toBe(1);
  });

  it("es negativo para fechas pasadas", () => {
    expect(diasHasta("2026-07-30", "2026-07-31")).toBe(-1);
  });

  it("cruza bien el cambio de mes y de año", () => {
    expect(diasHasta("2027-01-01", "2026-12-31")).toBe(1);
    expect(diasHasta("2026-03-01", "2026-02-28")).toBe(1);
  });
});

describe("progresoCampana", () => {
  const [i, f] = ["2026-07-01", "2026-07-31"];

  it("es 0 antes de empezar", () => {
    expect(progresoCampana(i, f, "2026-06-01")).toBe(0);
  });

  it("es 100 el último día (la campaña se completó)", () => {
    expect(progresoCampana(i, f, "2026-07-31")).toBe(100);
  });

  it("queda a mitad de camino a mitad del mes", () => {
    expect(progresoCampana(i, f, "2026-07-16")).toBeGreaterThan(45);
    expect(progresoCampana(i, f, "2026-07-16")).toBeLessThan(60);
  });

  it("nunca se pasa de 100", () => {
    expect(progresoCampana(i, f, "2027-01-01")).toBe(100);
  });
});

describe("sumarDias", () => {
  it("cruza fin de mes", () => {
    expect(sumarDias("2026-07-31", 1)).toBe("2026-08-01");
  });

  it("cruza fin de año", () => {
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("respeta los años bisiestos", () => {
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(sumarDias("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("resta con números negativos", () => {
    expect(sumarDias("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("soloFecha", () => {
  it("recorta timestamps completos", () => {
    expect(soloFecha("2026-07-31T14:22:00.000Z")).toBe("2026-07-31");
  });

  it("tolera vacío", () => {
    expect(soloFecha(undefined)).toBe("");
    expect(soloFecha(null)).toBe("");
  });
});

describe("sumarMeses — fecha de fin de un contrato", () => {
  it("3 meses desde el 1 de julio termina el 30 de septiembre", () => {
    // Meses COMPLETOS: no el 1 de octubre.
    expect(sumarMeses("2026-07-01", 3)).toBe("2026-09-30");
  });

  it("6 y 12 meses desde el 1 de enero", () => {
    expect(sumarMeses("2026-01-01", 6)).toBe("2026-06-30");
    expect(sumarMeses("2026-01-01", 12)).toBe("2026-12-31");
  });

  it("no se desborda cuando el día no existe en el mes destino", () => {
    // 31 de enero + 1 mes: febrero no tiene 31, así que cae al último
    // día real de febrero (28) y luego resta uno -> 27.
    expect(sumarMeses("2026-01-31", 1)).toBe("2026-02-27");
  });

  it("cruza el fin de año", () => {
    expect(sumarMeses("2026-11-15", 3)).toBe("2027-02-14");
  });

  it("respeta los años bisiestos", () => {
    expect(sumarMeses("2028-01-29", 1)).toBe("2028-02-28");
  });

  it("empieza a mitad de mes y termina el día anterior", () => {
    expect(sumarMeses("2026-07-26", 3)).toBe("2026-10-25");
  });

  it("la fecha de fin siempre es posterior al inicio", () => {
    for (const meses of [3, 6, 12]) {
      for (const inicio of ["2026-01-31", "2026-02-28", "2026-07-26", "2026-12-01"]) {
        expect(sumarMeses(inicio, meses) > inicio).toBe(true);
      }
    }
  });
});
