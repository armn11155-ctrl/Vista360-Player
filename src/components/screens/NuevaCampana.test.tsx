import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const enviarSolicitud = vi.hoisted(() => vi.fn(async (_payload: Record<string, unknown>) => ({ data: { ok: true, id: "sol-1" } })));

vi.mock("firebase/functions", () => ({ httpsCallable: () => enviarSolicitud }));
vi.mock("../../config/firebase", () => ({ cloudFunctions: {} }));
vi.mock("../../hooks/usePanelesDisponibles", () => ({ usePanelesDisponibles: () => ({ status: "ready", paneles: [] }) }));

import NuevaCampana from "./NuevaCampana";

const prefill = {
  ciudad: "Huánuco",
  panelId: "panel-1",
  panelNombre: "Panel mediano PB",
  motivo: "disponibilidad" as const,
};

describe("solicitud comercial desde Cobertura", () => {
  beforeEach(() => enviarSolicitud.mockClear());
  afterEach(() => cleanup());

  it("pide el mural elegido cuando se mantiene Este espacio", async () => {
    render(<NuevaCampana clienteId="cliente-1" onBack={() => undefined} onEnviada={() => undefined} prefill={prefill} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Nombre de la campaña" }), { target: { value: "Lanzamiento" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    await waitFor(() => expect(enviarSolicitud).toHaveBeenCalledOnce());
    expect(enviarSolicitud.mock.calls[0][0]).toMatchObject({
      clienteId: "cliente-1",
      ciudades: ["Huánuco"],
      panelSolicitadoId: "panel-1",
      panelSolicitadoNombre: "Panel mediano PB",
    });
  });

  it("envía una consulta de alternativas sin fijar el mural", async () => {
    render(<NuevaCampana clienteId="cliente-1" onBack={() => undefined} onEnviada={() => undefined} prefill={prefill} />);
    fireEvent.click(screen.getByRole("button", { name: /Ver alternativas/ }));
    expect(screen.getByText("Alternativas en Huánuco · 3 meses")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Nombre de la campaña" }), { target: { value: "Lanzamiento" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    await waitFor(() => expect(enviarSolicitud).toHaveBeenCalledOnce());
    const payload = enviarSolicitud.mock.calls[0]![0];
    expect(payload.ciudades).toEqual(["Huánuco"]);
    expect(payload.comentarios).toContain("Prefiero recibir alternativas similares en Huánuco.");
    expect(payload).not.toHaveProperty("panelSolicitadoId");
    expect(payload).not.toHaveProperty("panelSolicitadoNombre");
  });
});
