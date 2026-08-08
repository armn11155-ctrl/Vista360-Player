import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ClientScreenHeader from "./ClientScreenHeader";

describe("ClientScreenHeader", () => {
  it("mantiene título, menú y notificaciones en una estructura común", () => {
    const onMenuClick = vi.fn();
    const onNotifClick = vi.fn();

    render(
      <ClientScreenHeader
        title="Campañas"
        onMenuClick={onMenuClick}
        onNotifClick={onNotifClick}
        totalNotifs={12}
      />,
    );

    expect(screen.getByRole("heading", { name: "Campañas" })).toBeInTheDocument();
    expect(screen.getByText("9+")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Abrir menú" }));
    fireEvent.click(screen.getByRole("button", { name: "Notificaciones, 12 pendientes" }));

    expect(onMenuClick).toHaveBeenCalledOnce();
    expect(onNotifClick).toHaveBeenCalledOnce();
  });

  it("no muestra contador cuando no hay notificaciones", () => {
    render(<ClientScreenHeader title="Cobertura" onNotifClick={() => undefined} />);

    expect(screen.getByRole("button", { name: "Notificaciones" })).toBeInTheDocument();
    expect(screen.queryByText("9+")).not.toBeInTheDocument();
  });
});
