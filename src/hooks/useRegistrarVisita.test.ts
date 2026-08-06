import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { llamada } = vi.hoisted(() => ({
  llamada: vi.fn(async () => ({ data: { ok: true } })),
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(() => llamada),
}));

vi.mock("../config/firebase", () => ({ cloudFunctions: {} }));

import { useRegistrarVisita } from "./useRegistrarVisita";

describe("useRegistrarVisita — agrupación de pantallas", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    llamada.mockClear();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("envía varias pantallas recorridas como una sola llamada", async () => {
    const uid = "uid-lote-prueba";
    const { rerender } = renderHook(
      ({ pantalla }) => useRegistrarVisita(uid, pantalla),
      { initialProps: { pantalla: "inicio" } },
    );

    rerender({ pantalla: "campanas" });
    rerender({ pantalla: "reportes" });

    expect(llamada).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });

    expect(llamada).toHaveBeenCalledTimes(1);
    expect(llamada).toHaveBeenCalledWith({
      pantallas: ["inicio", "campanas", "reportes"],
    });
  });
});
