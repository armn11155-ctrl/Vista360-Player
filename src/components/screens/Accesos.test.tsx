import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DialogosProvider } from "../DialogosProvider";

vi.mock("../../hooks/useInvitaciones", () => ({
  useInvitaciones: () => ({
    status: "ready",
    invitaciones: [
      { id: "cliente-activo", uid: "c1", email: "activo@cliente.pe", clienteId: "ca", clienteNombre: "Cliente Activo", link: "https://example.test/a", archived: false },
      { id: "cliente-archivado", uid: "c2", email: "archivado@cliente.pe", clienteId: "cz", clienteNombre: "Cliente Archivado", link: "https://example.test/z", archived: true },
      { id: "interno-duplicado", uid: "g1", email: "gerente@vista360.pe", clienteId: null, clienteNombre: "", link: "", esAdmin: true, archived: false },
    ],
  }),
}));

vi.mock("../../hooks/useClientesAdmin", () => ({
  useClientesAdmin: () => ({ status: "ready", clientes: [] }),
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: () => async () => ({
    data: {
      personal: [
        { uid: "g1", nombre: "Gerente Activo", email: "gerente@vista360.pe", role: "Gerente", archived: false },
        { uid: "t1", nombre: "Trabajador Archivado", email: "trabajador@vista360.pe", role: "Trabajador", archived: true },
      ],
    },
  }),
}));

vi.mock("firebase/firestore", () => ({ doc: vi.fn(), getDoc: vi.fn() }));
vi.mock("../../config/firebase", () => ({ cloudFunctions: {}, db: {} }));
vi.mock("../../config/r2", () => ({ subirAvatarR2: vi.fn() }));
vi.mock("../../utils/comprimirImagen", () => ({ comprimirAvatarWebp: vi.fn() }));
vi.mock("../../config/reautenticacion", () => ({ conReautenticacion: vi.fn() }));
vi.mock("../BrandThumb", () => ({ BrandThumb: () => <span data-testid="brand-thumb" aria-hidden="true">avatar</span> }));
vi.mock("../ClientAvatarPicker", () => ({ ClientAvatarPicker: () => <div /> }));

import Accesos from "./Accesos";

describe("Accesos", () => {
  afterEach(() => cleanup());

  it("abre en Activos y separa personal interno de clientes", async () => {
    render(
      <DialogosProvider>
        <Accesos onBack={() => undefined} esGerente uidPropio="g1" />
      </DialogosProvider>,
    );

    const activos = screen.getByRole("tab", { name: /Activos/ });
    expect(activos).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Clientes activos")).toBeInTheDocument();
    expect(screen.getByText("Cliente Activo")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Personal interno activo")).toBeInTheDocument());
    expect(screen.getByText("Gerente Activo")).toBeInTheDocument();
    expect(screen.queryByText("Trabajador Archivado")).not.toBeInTheDocument();
    expect(screen.getAllByText("Gerente Activo")).toHaveLength(1);
  });

  it("permite cambiar a Archivados y actualiza ambas secciones", async () => {
    render(
      <DialogosProvider>
        <Accesos onBack={() => undefined} esGerente uidPropio="g1" />
      </DialogosProvider>,
    );

    await waitFor(() => expect(screen.getByText("Gerente Activo")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: /Archivados/ }));

    expect(screen.getByRole("tab", { name: /Archivados/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Personal interno archivado")).toBeInTheDocument();
    expect(screen.getByText("Trabajador Archivado")).toBeInTheDocument();
    expect(screen.getByText("Clientes archivados")).toBeInTheDocument();
    expect(screen.getByText("Cliente Archivado")).toBeInTheDocument();
    expect(screen.queryByText("Cliente Activo")).not.toBeInTheDocument();
  });
});
