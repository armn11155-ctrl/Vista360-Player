import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/firebase", () => ({
  auth: null,
  login: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  browserLocalPersistence: {},
  browserSessionPersistence: {},
  setPersistence: vi.fn(),
}));

import LoginScreen from "./LoginScreen";
import { login } from "../config/firebase";

describe("LoginScreen en Safari móvil", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => cleanup());

  it("conserva el mismo input durante el primer toque de Contraseña", () => {
    const { container } = render(<LoginScreen onLoggedIn={() => undefined} />);
    const password = screen.getByLabelText("Contraseña") as HTMLInputElement;
    const shell = container.querySelector(".login-shell");

    expect(shell).toHaveClass("login-shell");
    expect(shell).not.toHaveClass("login-field-focused");

    fireEvent.pointerDown(password);
    expect(screen.getByLabelText("Contraseña")).toBe(password);

    act(() => password.focus());
    expect(document.activeElement).toBe(password);
    expect(screen.getByLabelText("Contraseña")).toBe(password);

    fireEvent.pointerUp(password);
    fireEvent.click(password);
    expect(document.activeElement).toBe(password);
    expect(screen.getByLabelText("Contraseña")).toBe(password);
    expect(shell).toHaveClass("login-shell");
  });

  it("cambia de Usuario a Contraseña sin desmontar el formulario", () => {
    render(<LoginScreen onLoggedIn={() => undefined} />);
    const usuario = screen.getByLabelText("Usuario") as HTMLInputElement;
    const password = screen.getByLabelText("Contraseña") as HTMLInputElement;

    act(() => usuario.focus());
    expect(document.activeElement).toBe(usuario);

    act(() => password.focus());
    expect(document.activeElement).toBe(password);
    expect(screen.getByLabelText("Usuario")).toBe(usuario);
    expect(screen.getByLabelText("Contraseña")).toBe(password);
  });

  it("muestra el aviso de credenciales y lo retira al corregir los datos", () => {
    render(<LoginScreen onLoggedIn={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Ingresa tu usuario y contraseña.");
    expect(screen.getByLabelText("Usuario")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "cliente@vista360.pe" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Usuario")).toHaveAttribute("aria-invalid", "false");
  });

  it("mantiene Ingresar bloqueado hasta que la pantalla de acceso se desmonte", async () => {
    let completar!: () => void;
    vi.mocked(login).mockReturnValueOnce(new Promise<void>((resolve) => { completar = resolve; }) as ReturnType<typeof login>);
    const onLoggedIn = vi.fn();
    render(<LoginScreen onLoggedIn={onLoggedIn} />);

    fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: "cliente@vista360.pe" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "segura" } });
    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(screen.getByRole("button", { name: "Ingresando…" })).toBeDisabled();
    await act(async () => completar());

    expect(onLoggedIn).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Ingresando…" })).toBeDisabled();
  });
});
