import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDetectorDeBucles } from "./useDetectorDeBucles";

/**
 * La red de seguridad en tiempo de ejecución tiene que funcionar de
 * verdad: es lo único que cubre un bucle formado ENTRE archivos, o por
 * un patrón que los detectores estáticos todavía no conocen.
 */

describe("aviso de renders desbocados", () => {
  afterEach(() => vi.restoreAllMocks());

  it("no dice nada con un número normal de renders", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = renderHook(() => useDetectorDeBucles("Prueba"));
    for (let i = 0; i < 20; i++) rerender();
    expect(error).not.toHaveBeenCalled();
  });

  it("avisa al pasar del límite dentro de la misma ventana", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = renderHook(() => useDetectorDeBucles("Prueba"));
    for (let i = 0; i < 120; i++) rerender();
    expect(error).toHaveBeenCalled();
    expect(String(error.mock.calls[0][0])).toContain("bucle de renderizado");
    expect(String(error.mock.calls[0][0])).toContain("Prueba");
  });

  it("avisa UNA sola vez por ventana", () => {
    // Escribir en cada render llenaría la consola y encima empeoraría el
    // problema: el propio console.error cuesta tiempo.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = renderHook(() => useDetectorDeBucles("Prueba"));
    for (let i = 0; i < 300; i++) rerender();
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("el contador se reinicia al pasar la ventana de tiempo", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    let ahora = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => ahora);
    const { rerender } = renderHook(() => useDetectorDeBucles("Prueba"));
    for (let i = 0; i < 40; i++) rerender();
    ahora += 5000; // pasa la ventana
    for (let i = 0; i < 40; i++) rerender();
    // 80 renders en total, pero repartidos: no es un bucle.
    expect(error).not.toHaveBeenCalled();
  });

  it("está enchufado en los dos componentes con estado de la app", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { resolve } = require("node:path") as typeof import("node:path");
    const app = readFileSync(resolve(__dirname, "../App.tsx"), "utf-8");
    expect(app).toContain('useDetectorDeBucles("App")');
    expect(app).toContain('useDetectorDeBucles("AuthenticatedApp")');
  });
});
