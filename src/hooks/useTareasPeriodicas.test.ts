import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const getDocMock = vi.fn();
vi.mock("firebase/firestore", () => ({
  doc: (_d: unknown, a: string, b: string) => `${a}/${b}`,
  getDoc: (...args: unknown[]) => getDocMock(...args),
}));
vi.mock("../config/firebase", () => ({ db: {} }));

import { renderHook, waitFor } from "@testing-library/react";

const HOY = Date.parse("2026-08-05T12:00:00.000Z");
const haceDias = (d: number) => new Date(HOY - d * 86400000).toISOString();

async function montar(datos: Record<string, unknown> | undefined, interno = true) {
  vi.resetModules();
  getDocMock.mockResolvedValue({ data: () => datos });
  const { useTareasPeriodicas } = await import("./useTareasPeriodicas");
  return renderHook(() => useTareasPeriodicas(interno));
}

describe("guardián de tareas periódicas", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(HOY);
    getDocMock.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  const TODAS_AL_DIA = {
    sincronizarEstadoPaneles: haceDias(0),
    recordatorioVencimientoCampanas: haceDias(0),
    recordatorioReportesMensuales: haceDias(0),
  };

  it("calla cuando todas han corrido hoy", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await montar(TODAS_AL_DIA);
    await new Promise((r) => setTimeout(r, 20));
    expect(error).not.toHaveBeenCalled();
  });

  it("tolera un retraso de un día sin quejarse", async () => {
    // Un cron puede retrasarse, o puede haber un despliegue en marcha.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await montar({ ...TODAS_AL_DIA, recordatorioReportesMensuales: haceDias(1) });
    await new Promise((r) => setTimeout(r, 20));
    expect(error).not.toHaveBeenCalled();
  });

  it("avisa cuando una lleva días sin correr, y dice qué se degrada", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await montar({ ...TODAS_AL_DIA, recordatorioVencimientoCampanas: haceDias(9) });
    await waitFor(() => expect(error).toHaveBeenCalled());

    const datos = error.mock.calls[0][1] as { tareas: Array<Record<string, unknown>> };
    expect(datos.tareas).toHaveLength(1);
    expect(datos.tareas[0].nombre).toBe("recordatorioVencimientoCampanas");
    expect(datos.tareas[0].diasSinCorrer).toBe(9);
    // La consecuencia en lenguaje de negocio, no técnico.
    expect(String(datos.tareas[0].consecuencia)).toContain("renovar");
  });

  it("avisa también si una tarea NUNCA ha corrido", async () => {
    // Es el caso de una función que no llegó a desplegarse. Se despliegan
    // tolerando fallos, así que puede pasar sin que nadie se entere.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await montar({ sincronizarEstadoPaneles: haceDias(0) });
    await waitFor(() => expect(error).toHaveBeenCalled());
    const datos = error.mock.calls[0][1] as { tareas: Array<Record<string, unknown>> };
    expect(datos.tareas.map((t) => t.diasSinCorrer)).toContain("nunca ha corrido");
  });

  it("un CLIENTE no lo lee: no paga esa lectura", async () => {
    await montar(TODAS_AL_DIA, false);
    await new Promise((r) => setTimeout(r, 20));
    expect(getDocMock).not.toHaveBeenCalled();
  });

  it("se lee UNA vez por carga, no en cada render", async () => {
    const { rerender } = await montar(TODAS_AL_DIA);
    for (let i = 0; i < 10; i++) rerender();
    await new Promise((r) => setTimeout(r, 20));
    expect(getDocMock).toHaveBeenCalledTimes(1);
  });

  it("si no hay permiso o falla la lectura, calla", async () => {
    // Un guardián ruidoso deja de leerse. Esto no es asunto suyo.
    vi.resetModules();
    getDocMock.mockRejectedValue(new Error("permission-denied"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { useTareasPeriodicas } = await import("./useTareasPeriodicas");
    renderHook(() => useTareasPeriodicas(true));
    await new Promise((r) => setTimeout(r, 30));
    expect(error).not.toHaveBeenCalled();
  });
});
