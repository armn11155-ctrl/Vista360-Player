import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import CommandPalette, { type CommandItem } from "./CommandPalette";

function Harness({ items }: { items: CommandItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Abrir</button>
      <CommandPalette open={open} onOpenChange={setOpen} items={items} contexto="la prueba" />
    </>
  );
}

describe("CommandPalette", () => {
  it("abre con Cmd/Ctrl+K y filtra únicamente los elementos recibidos en memoria", () => {
    const abrirCampana = vi.fn();
    render(<Harness items={[
      { id: "cliente-1", kind: "cliente", label: "Bububots", detail: "Cliente", onSelect: vi.fn() },
      { id: "campana-1", kind: "campana", label: "Campaña Verano", detail: "Lima", onSelect: abrirCampana },
    ]} />);

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const input = screen.getByRole("combobox", { name: "Buscar en Vista360" });
    fireEvent.change(input, { target: { value: "verano" } });

    expect(screen.getByText("Campaña Verano")).toBeInTheDocument();
    expect(screen.queryByText("Bububots")).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(abrirCampana).toHaveBeenCalledTimes(1);
  });

  it("se cierra con Escape sin ejecutar una acción", () => {
    const accion = vi.fn();
    render(<Harness items={[{ id: "inicio", kind: "modulo", label: "Inicio", onSelect: accion }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(accion).not.toHaveBeenCalled();
  });
});
