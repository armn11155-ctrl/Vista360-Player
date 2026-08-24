import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => ({
  activar: vi.fn(),
  diagnostico: vi.fn(async () => "diagnóstico"),
  permiso: vi.fn(),
  disponible: vi.fn(async () => true),
  registrado: vi.fn(),
}));

vi.mock("../utils/pushNotifications", () => ({
  activarNotificacionesPush: push.activar,
  diagnosticoPush: push.diagnostico,
  estadoPermisoNotificaciones: push.permiso,
  pushDisponible: push.disponible,
  yaRegistradoEnEsteNavegador: push.registrado,
}));

import { usePushEstado } from "./usePushEstado";

describe("usePushEstado", () => {
  beforeEach(() => {
    vi.useRealTimers();
    push.activar.mockReset();
    push.diagnostico.mockClear();
    push.permiso.mockReset();
    push.disponible.mockClear();
    push.registrado.mockReset();
    push.disponible.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("no muestra activado hasta confirmar el token con Firebase", async () => {
    let resolver!: (resultado: { ok: true }) => void;
    push.permiso.mockReturnValue("granted");
    push.registrado.mockReturnValue(false);
    push.activar.mockReturnValue(new Promise((resolve) => { resolver = resolve; }));

    const { result } = renderHook(() => usePushEstado("uid-1"));
    await waitFor(() => expect(result.current.estado).toBe("activando"));
    expect(push.activar).toHaveBeenCalledWith("uid-1", { confirmar: false });

    await act(async () => resolver({ ok: true }));
    expect(result.current.estado).toBe("activado");
  });

  it("muestra un error técnico si el permiso existe pero el token no quedó registrado", async () => {
    push.permiso.mockReturnValue("granted");
    push.registrado.mockReturnValue(false);
    push.activar.mockResolvedValue({ ok: false, error: "FCM no respondió" });

    const { result } = renderHook(() => usePushEstado("uid-2"));
    await waitFor(() => expect(result.current.estado).toBe("error"));
    expect(result.current.error).toBe("FCM no respondió");
  });

  it("detecta Permitir aunque el menú del navegador no quite el foco", async () => {
    vi.useFakeTimers();
    let permiso: NotificationPermission = "denied";
    push.permiso.mockImplementation(() => permiso);
    push.registrado.mockReturnValue(true);

    const { result } = renderHook(() => usePushEstado("uid-3"));
    expect(result.current.estado).toBe("bloqueado");

    permiso = "granted";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_250);
    });
    expect(result.current.estado).toBe("activado");
  });
});
