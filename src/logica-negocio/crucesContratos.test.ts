import { describe, expect, it } from "vitest";
import {
  cruces,
  limiteAlcanzado,
  panelesDelContrato,
  seCruzan,
  type ContratoParaCruce,
} from "../../functions/src/reglasOcupacion";

/**
 * Esta es la regla que impide VENDER DOS VECES el mismo espacio físico.
 * Corre dentro de una transacción en crearContrato/actualizarContrato,
 * así que hasta ahora era imposible de probar sin levantar Firestore --
 * se aisló a propósito para poder verificarla acá.
 *
 * Un fallo silencioso en esta lógica no se ve en pantalla: se descubre
 * el día que dos clientes reclaman la misma lona en las mismas fechas.
 */

const c = (extra: Partial<ContratoParaCruce> = {}): ContratoParaCruce => ({
  cliente_id: "otro-cliente",
  panel_id: "panel-1",
  inicio: "2026-08-01",
  fin: "2026-08-31",
  ...extra,
});

describe("seCruzan — solapamiento de fechas", () => {
  it("rangos totalmente separados no se cruzan", () => {
    expect(seCruzan("2026-01-01", "2026-01-31", "2026-02-01", "2026-02-28")).toBe(false);
  });

  it("un rango dentro de otro sí se cruza", () => {
    expect(seCruzan("2026-01-01", "2026-12-31", "2026-06-01", "2026-06-30")).toBe(true);
  });

  it("rangos idénticos se cruzan", () => {
    expect(seCruzan("2026-01-01", "2026-01-31", "2026-01-01", "2026-01-31")).toBe(true);
  });

  it("BORDE: si una termina el mismo día que empieza la otra, cuenta como cruce", () => {
    // La lona no se puede cambiar a mitad de día. Si esto devolviera
    // false, se podrían vender dos campañas que comparten un día real
    // de exhibición.
    expect(seCruzan("2026-01-01", "2026-01-31", "2026-01-31", "2026-02-28")).toBe(true);
  });

  it("BORDE: un solo día de diferencia ya NO es cruce", () => {
    expect(seCruzan("2026-01-01", "2026-01-31", "2026-02-01", "2026-02-28")).toBe(false);
  });

  it("es simétrico: el orden de los rangos no cambia el resultado", () => {
    expect(seCruzan("2026-01-01", "2026-06-30", "2026-03-01", "2026-09-30")).toBe(
      seCruzan("2026-03-01", "2026-09-30", "2026-01-01", "2026-06-30")
    );
  });
});

describe("panelesDelContrato — compatibilidad entre el formato viejo y el nuevo", () => {
  it("usa panel_ids cuando existe (campaña multi-panel)", () => {
    expect(panelesDelContrato({ panel_id: "p1", panel_ids: ["p1", "p2"] })).toEqual(["p1", "p2"]);
  });

  it("cae a panel_id en los contratos viejos", () => {
    expect(panelesDelContrato({ panel_id: "p1" })).toEqual(["p1"]);
  });

  it("un contrato sin paneles no rompe nada", () => {
    expect(panelesDelContrato({})).toEqual([]);
    expect(panelesDelContrato({ panel_ids: [] })).toEqual([]);
  });
});

describe("cruces — soporte FISICO (lona/mural: cuenta cualquier cliente)", () => {
  const opciones = {
    panelId: "panel-1",
    inicio: "2026-08-15",
    fin: "2026-09-15",
    clienteId: "mi-cliente",
    soporteLimitado: true,
  };

  it("detecta el choque con la campaña de OTRO cliente", () => {
    expect(cruces([c()], opciones)).toHaveLength(1);
  });

  it("ignora los contratos borrados", () => {
    expect(cruces([c({ deleted: true })], opciones)).toHaveLength(0);
  });

  it("ignora los contratos de OTRO panel", () => {
    expect(cruces([c({ panel_id: "panel-9" })], opciones)).toHaveLength(0);
  });

  it("ignora las campañas que ya terminaron antes", () => {
    expect(cruces([c({ inicio: "2026-01-01", fin: "2026-02-01" })], opciones)).toHaveLength(0);
  });

  it("detecta el choque cuando el otro contrato es multi-panel", () => {
    expect(cruces([c({ panel_id: "panel-7", panel_ids: ["panel-7", "panel-1"] })], opciones)).toHaveLength(1);
  });

  it("no explota con contratos a los que les faltan las fechas", () => {
    expect(cruces([c({ inicio: undefined }), c({ fin: undefined })], opciones)).toHaveLength(0);
  });
});

describe("cruces — pantalla LED (rota anuncios: solo choca conmigo mismo)", () => {
  const opciones = {
    panelId: "panel-1",
    inicio: "2026-08-15",
    fin: "2026-09-15",
    clienteId: "mi-cliente",
    soporteLimitado: false,
  };

  it("la campaña de otro cliente NO estorba", () => {
    expect(cruces([c({ cliente_id: "otro-cliente" })], opciones)).toHaveLength(0);
  });

  it("pero mi propia campaña cruzada SÍ", () => {
    expect(cruces([c({ cliente_id: "mi-cliente" })], opciones)).toHaveLength(1);
  });
});

describe("cruces — al EDITAR, la campaña no debe chocar consigo misma", () => {
  it("se excluye a sí misma cuando se le pasa su id", () => {
    const contratos = [c({ cliente_id: "mi-cliente" })];
    const idDe = () => "contrato-editado";
    const opciones = {
      panelId: "panel-1",
      inicio: "2026-08-15",
      fin: "2026-09-15",
      clienteId: "mi-cliente",
      soporteLimitado: true,
      excluirId: "contrato-editado",
    };
    expect(cruces(contratos, opciones, idDe)).toHaveLength(0);
    // ...pero sigue detectando a las demás.
    expect(cruces(contratos, { ...opciones, excluirId: "otro-id" }, idDe)).toHaveLength(1);
  });
});

describe("limiteAlcanzado — cuándo se bloquea de verdad", () => {
  it("lona/mural (1 cupo): un solo cruce ya bloquea", () => {
    expect(limiteAlcanzado(0, 1)).toBe(false);
    expect(limiteAlcanzado(1, 1)).toBe(true);
  });

  it("unipolar (2 cupos): con una cara ocupada todavía se puede vender", () => {
    expect(limiteAlcanzado(1, 2)).toBe(false);
    expect(limiteAlcanzado(2, 2)).toBe(true);
  });

  it("LED (sin tope): basta un cruce del propio cliente", () => {
    expect(limiteAlcanzado(0, Infinity)).toBe(false);
    expect(limiteAlcanzado(1, Infinity)).toBe(true);
  });
});

describe("caso completo: no se puede vender dos veces la misma lona", () => {
  it("primera campaña entra; una segunda en fechas cruzadas queda bloqueada", () => {
    const yaVendida = c({ cliente_id: "cliente-A", inicio: "2026-08-01", fin: "2026-08-31" });
    const pedido = {
      panelId: "panel-1",
      inicio: "2026-08-20", // se pisa 11 días con la de cliente-A
      fin: "2026-09-20",
      clienteId: "cliente-B",
      soporteLimitado: true,
    };
    const choques = cruces([yaVendida], pedido);
    expect(choques).toHaveLength(1);
    expect(limiteAlcanzado(choques.length, 1)).toBe(true);
  });

  it("pero a partir del día siguiente sí entra", () => {
    const yaVendida = c({ cliente_id: "cliente-A", inicio: "2026-08-01", fin: "2026-08-31" });
    const pedido = {
      panelId: "panel-1",
      inicio: "2026-09-01",
      fin: "2026-09-30",
      clienteId: "cliente-B",
      soporteLimitado: true,
    };
    expect(limiteAlcanzado(cruces([yaVendida], pedido).length, 1)).toBe(false);
  });
});
