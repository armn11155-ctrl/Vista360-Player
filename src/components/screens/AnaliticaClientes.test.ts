import { describe, expect, it } from "vitest";
import { tiempoRelativo, colorEstado, pantallaFavorita } from "./AnaliticaClientes";

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

describe("pantallaFavorita", () => {
  it("null si el cliente nunca visitó ninguna pantalla", () => {
    expect(pantallaFavorita({})).toBeNull();
  });

  it("devuelve la pantalla con más visitas, con nombre legible", () => {
    const resultado = pantallaFavorita({
      inicio: { count: 3, lastVisit: null },
      evidencias: { count: 8, lastVisit: null },
      reportes: { count: 1, lastVisit: null },
    });
    expect(resultado).toEqual({ nombre: "Evidencias", count: 8 });
  });

  it("si la pantalla no tiene nombre legible conocido, usa el id tal cual", () => {
    const resultado = pantallaFavorita({ "pantalla-nueva": { count: 2, lastVisit: null } });
    expect(resultado).toEqual({ nombre: "pantalla-nueva", count: 2 });
  });
});
