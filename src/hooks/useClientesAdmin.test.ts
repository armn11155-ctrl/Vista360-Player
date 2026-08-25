import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let emitirAgregado: ((datos: Record<string, unknown>) => void) | null = null;

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  onSnapshot: vi.fn((_ref: unknown, onNext: (snap: unknown) => void) => {
    emitirAgregado = (datos) => onNext({ exists: () => true, data: () => datos });
    return () => {};
  }),
}));

vi.mock("../config/firebase", () => ({ db: {}, registrarLimpiezaDeSesion: vi.fn() }));

import { useSelectorDeClientes } from "./useClientesAdmin";

describe("useSelectorDeClientes — regreso inmediato al selector", () => {
  beforeEach(() => { emitirAgregado = null; });

  it("muestra la última lista en el primer render mientras refresca detrás", async () => {
    const primero = renderHook(() => useSelectorDeClientes());
    expect(primero.result.current.state.status).toBe("loading");

    act(() => {
      emitirAgregado!({
        partes: 1,
        clientes: [{
          id: "cliente-1",
          empresa: "Cliente Uno",
          archived: false,
          avatarUrl: "",
          avatarKey: "blue",
          contacto: "Alan",
          campanasActivas: 3,
        }],
      });
    });
    await waitFor(() => expect(primero.result.current.state.status).toBe("ready"));
    primero.unmount();

    const segundo = renderHook(() => useSelectorDeClientes());
    expect(segundo.result.current.state).toMatchObject({
      status: "ready",
      clientes: [{ id: "cliente-1", empresa: "Cliente Uno" }],
    });
    expect(segundo.result.current.campanasActivas).toEqual({ "cliente-1": 3 });
  });
});
