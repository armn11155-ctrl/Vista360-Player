import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Sidebar from "./Sidebar";

describe("Sidebar", () => {
  it("muestra Perfil como acceso exclusivo de escritorio y usa el destino correcto", () => {
    const onNavigate = vi.fn();
    const onOpenPerfil = vi.fn();
    const { container } = render(
      <Sidebar
        open
        onClose={() => undefined}
        onNavigate={onNavigate}
        onLogout={() => undefined}
        active="inicio"
        perfilNombre="Vista360"
        onOpenPerfil={onOpenPerfil}
      />,
    );

    const perfil = container.querySelector<HTMLElement>('[data-sidebar-id="perfil"]');
    expect(perfil).not.toBeNull();
    expect(perfil).toHaveClass("sidebar-item-desktop-only");

    fireEvent.click(perfil!);

    expect(onOpenPerfil).toHaveBeenCalledOnce();
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
