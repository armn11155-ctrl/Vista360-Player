import { describe, it, expect } from "vitest";
import { modalidadDePanel, esPanelExclusivo } from "../types";

/**
 * La modalidad decide una regla de negocio con plata de por medio: si un
 * soporte es "lona", el sistema NO debe dejar que dos clientes se crucen
 * en fechas (es una sola pieza física instalada). Si es "led", sí puede
 * haber varios a la vez porque la pantalla rota anuncios.
 */

describe("modalidadDePanel — valor explícito manda", () => {
  it("respeta lona aunque el tipo diga LED", () => {
    expect(modalidadDePanel({ modalidad: "lona", tipo: "Pantalla LED" })).toBe("lona");
  });

  it("respeta led aunque el tipo diga lona", () => {
    expect(modalidadDePanel({ modalidad: "led", tipo: "Lona gigante" })).toBe("led");
  });
});

describe("modalidadDePanel — deducción para paneles viejos sin el campo", () => {
  it.each([
    ["Pantalla LED", "led"],
    ["LED full HD", "led"],
    ["pantalla digital", "led"],
    ["Digital vertical", "led"],
  ])("'%s' se deduce como %s", (tipo, esperado) => {
    expect(modalidadDePanel({ tipo })).toBe(esperado);
  });

  it.each([
    ["Lona", "lona"],
    ["lona 3x2", "lona"],
    ["Mural pintado", "lona"],
    ["Gigantografía", "lona"],
    ["Banner impreso", "lona"],
  ])("'%s' se deduce como %s", (tipo, esperado) => {
    expect(modalidadDePanel({ tipo })).toBe(esperado);
  });

  it("sin pistas cae en led, que es como venía funcionando", () => {
    expect(modalidadDePanel({ tipo: "" })).toBe("led");
    expect(modalidadDePanel({ tipo: "Soporte 12" })).toBe("led");
    expect(modalidadDePanel({ tipo: undefined as unknown as string })).toBe("led");
  });

  it("ignora un valor de modalidad inválido y deduce", () => {
    expect(modalidadDePanel({ modalidad: "otra" as never, tipo: "Lona" })).toBe("lona");
  });
});

describe("esPanelExclusivo", () => {
  it("una lona es exclusiva", () => {
    expect(esPanelExclusivo({ modalidad: "lona", tipo: "" })).toBe(true);
  });

  it("una LED no lo es", () => {
    expect(esPanelExclusivo({ modalidad: "led", tipo: "" })).toBe(false);
  });
});
