import { describe, expect, it } from "vitest";
import { normalizarResumenOcupacion, type ResumenOcupacion } from "./useOcupacion";

function resumenAnterior(): ResumenOcupacion {
  return {
    hoy: "2026-08-12",
    ventanaDias: 45,
    totales: {
      paneles: 2,
      operativos: 2,
      enMantenimiento: 0,
      trabajando: 1,
      libres: 1,
      ocupacionPct: 50,
      anunciantesActivos: 1,
      ingresoActivo: 1500,
      seLiberanEnVentana: 1,
      lonas: 0,
      lonasLibres: 0,
      ledConEspacio: 1,
      unipolares: 0,
      unipolaresConEspacio: 0,
    },
    paneles: [],
    porVencer: [],
    libres: [],
    cobranza: { facturas: [], total: 0, vencidas: 0, totalVencido: 0 },
  };
}

describe("normalizarResumenOcupacion", () => {
  it("mantiene compatible la respuesta de una Function anterior sin cobranza", () => {
    const anterior = resumenAnterior() as unknown as {
      cobranza?: ResumenOcupacion["cobranza"];
      totales: Partial<ResumenOcupacion["totales"]>;
    };
    delete anterior.cobranza;
    delete anterior.totales.unipolares;
    delete anterior.totales.unipolaresConEspacio;

    const normalizado = normalizarResumenOcupacion(anterior as ResumenOcupacion);

    expect(normalizado.cobranza).toEqual({ facturas: [], total: 0, vencidas: 0, totalVencido: 0 });
    expect(normalizado.totales.unipolares).toBe(0);
    expect(normalizado.totales.unipolaresConEspacio).toBe(0);
    expect(normalizado.totales.ocupacionPct).toBe(50);
  });

  it("conserva los datos actuales cuando la respuesta ya está completa", () => {
    const actual = resumenAnterior();
    actual.cobranza = { facturas: [], total: 4200, vencidas: 2, totalVencido: 1800 };

    expect(normalizarResumenOcupacion(actual)).toEqual(actual);
  });
});
