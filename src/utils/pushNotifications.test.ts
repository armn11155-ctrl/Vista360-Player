import { beforeEach, describe, expect, it, vi } from "vitest";
import { yaRegistradoEnEsteNavegador } from "./pushNotifications";

const CLAVE = "vista360_push_token_registrado:usuario-prueba";

describe("vigencia local del registro push", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it("migra el antiguo marcador permanente tratándolo como vencido", () => {
    localStorage.setItem(CLAVE, "1");
    expect(yaRegistradoEnEsteNavegador("usuario-prueba")).toBe(false);
  });

  it("acepta un registro reciente y renueva uno de más de siete días", () => {
    const ahora = new Date("2026-08-23T12:00:00Z");
    vi.setSystemTime(ahora);

    localStorage.setItem(CLAVE, String(ahora.getTime() - 6 * 24 * 60 * 60 * 1000));
    expect(yaRegistradoEnEsteNavegador("usuario-prueba")).toBe(true);

    localStorage.setItem(CLAVE, String(ahora.getTime() - 8 * 24 * 60 * 60 * 1000));
    expect(yaRegistradoEnEsteNavegador("usuario-prueba")).toBe(false);
  });
});
