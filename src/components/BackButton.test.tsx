import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BackButton from "./BackButton";

describe("BackButton", () => {
  it("expone la navegación de retorno como botón accesible", () => {
    const onClick = vi.fn();
    render(<BackButton onClick={onClick} />);

    const button = screen.getByRole("button", { name: "Volver" });
    fireEvent.click(button);

    expect(button).toHaveAttribute("type", "button");
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
