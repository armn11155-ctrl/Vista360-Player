import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Sidebar from "./Sidebar";

const propsBase = {
  open: true,
  onClose: vi.fn(),
  onNavigate: vi.fn(),
  onLogout: vi.fn(),
};

describe("salida de Vista cliente", () => {
  it("se muestra al personal interno que está viendo como cliente", () => {
    const { container } = render(
      <Sidebar
        {...propsBase}
        isAdmin={false}
        esInterno
        onCambiarCliente={vi.fn()}
      />
    );

    expect(screen.getByText("Cambiar cliente")).toBeTruthy();
    expect(container.querySelector(".sidebar-bottom-section-switch-client-view")).toBeTruthy();
  });

  it("no se expone a un cliente real aunque reciba el callback por error", () => {
    render(
      <Sidebar
        {...propsBase}
        isAdmin={false}
        esInterno={false}
        onCambiarCliente={vi.fn()}
      />
    );

    expect(screen.queryByText("Cambiar cliente")).toBeNull();
  });
});
