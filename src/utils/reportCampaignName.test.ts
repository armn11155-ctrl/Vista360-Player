import { describe, expect, it } from "vitest";
import type { Contrato, InformeCliente, Panel } from "../types";
import { nombreCampanaVisibleEnReporte } from "./reportCampaignName";

const informe = {
  id: "reporte-1",
  cliente_id: "cliente-1",
  mes: "2026-08",
  mesLabel: "Agosto 2026",
  url: "https://example.test/reporte.pdf",
  contratoId: "campana-1",
  contratoNombre: "Nombre anterior",
} as InformeCliente;

const contrato = {
  id: "campana-1",
  cliente_id: "cliente-1",
  panel_id: "panel-1",
  inicio: "2026-08-01",
  fin: "2026-12-31",
  monto: 100,
  pagado: true,
  nombre: "nombre actualizado",
} as Contrato;

const paneles = {
  "panel-1": { id: "panel-1", nombre: "Panel Centro" } as Panel,
};

describe("nombre visible de campaña en reportes", () => {
  it("usa el nombre vigente y no la copia guardada al generar el reporte", () => {
    expect(nombreCampanaVisibleEnReporte(informe, [contrato], paneles)).toBe("Nombre actualizado");
  });

  it("usa los paneles actuales cuando la campaña no tiene nombre manual", () => {
    expect(nombreCampanaVisibleEnReporte(informe, [{ ...contrato, nombre: "" }], paneles)).toBe("Panel Centro");
  });

  it("conserva el nombre histórico si la campaña ya no está disponible", () => {
    expect(nombreCampanaVisibleEnReporte(informe, [], paneles)).toBe("Nombre anterior");
  });

  it("usa una etiqueta neutra para reportes antiguos sin campaña identificable", () => {
    expect(nombreCampanaVisibleEnReporte({ ...informe, contratoNombre: undefined }, [], paneles)).toBe("Reporte mensual");
  });
});
