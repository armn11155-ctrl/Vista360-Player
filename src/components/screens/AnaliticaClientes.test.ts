import { describe, expect, it } from "vitest";
import { tiempoRelativo, colorEstado } from "./AnaliticaClientes";

describe("tiempoRelativo", () => {
  it("nunca entró (null) devuelve mensaje explícito", () => {
    expect(tiempoRelativo(null)).toBe("Nunca entró");
  });

  it("hace menos de 1 minuto", () => {
    expect(tiempoRelativo(Date.now() - 30_000)).toBe("Hace un momento");
  });

  it("hace algunos minutos", () => {
    expect(tiempoRelativo(Date.now() - 15 * 60_000)).toBe("Hace 15 min");
  });

  it("hace algunas horas", () => {
    expect(tiempoRelativo(Date.now() - 5 * 3_600_000)).toBe("Hace 5 h");
  });

  it("ayer", () => {
    expect(tiempoRelativo(Date.now() - 25 * 3_600_000)).toBe("Ayer");
  });

  it("hace varios días", () => {
    expect(tiempoRelativo(Date.now() - 5 * 86_400_000)).toBe("Hace 5 días");
  });
});

describe("colorEstado", () => {
  it("gris si nunca entró", () => {
    expect(colorEstado(null)).toBe("#9CA3AF");
  });

  it("verde si entró hace menos de 3 días", () => {
    expect(colorEstado(Date.now() - 1 * 86_400_000)).toBe("#16A34A");
  });

  it("ámbar si entró entre 3 y 14 días", () => {
    expect(colorEstado(Date.now() - 7 * 86_400_000)).toBe("#D97706");
  });

  it("gris si entró hace más de 14 días", () => {
    expect(colorEstado(Date.now() - 30 * 86_400_000)).toBe("#9CA3AF");
  });
});
