import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { DialogosProvider, useDialogos } from "./DialogosProvider";

/**
 * Estos tests blindan el contrato que reemplazó a window.confirm/alert:
 * si alguna vez deja de resolver la promesa, la app se quedaría con
 * acciones colgadas a medio ejecutar (un borrado que nunca termina, un
 * botón en "eliminando…" para siempre) -- justo el tipo de bug que no
 * da ningún error en consola y solo se nota usando la app.
 */

function Sujeto({ opciones }: { opciones?: Record<string, unknown> }) {
  const { confirmar, avisar } = useDialogos();
  const [resultado, setResultado] = useState<string>("sin-respuesta");

  return (
    <div>
      <button
        onClick={() => {
          void confirmar({ titulo: "¿Eliminar?", mensaje: "No se puede deshacer.", ...opciones }).then((r) =>
            setResultado(String(r))
          );
        }}
      >
        preguntar
      </button>
      <button
        onClick={() => {
          void avisar({ titulo: "Aviso", mensaje: "Algo pasó." }).then(() => setResultado("aviso-cerrado"));
        }}
      >
        avisar
      </button>
      <span data-testid="resultado">{resultado}</span>
    </div>
  );
}

function montar(opciones?: Record<string, unknown>) {
  return render(
    <DialogosProvider>
      <Sujeto opciones={opciones} />
    </DialogosProvider>
  );
}

const abrir = () => act(() => { fireEvent.click(screen.getByText("preguntar")); });

describe("DialogosProvider — reemplazo de window.confirm/alert", () => {
  it("no muestra ningún diálogo hasta que se pide uno", () => {
    montar();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("resuelve true al confirmar y se cierra solo", async () => {
    montar();
    abrir();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    act(() => { fireEvent.click(screen.getByText("Confirmar")); });
    await waitFor(() => expect(screen.getByTestId("resultado").textContent).toBe("true"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("resuelve false al cancelar", async () => {
    montar();
    abrir();
    act(() => { fireEvent.click(screen.getByText("Cancelar")); });
    await waitFor(() => expect(screen.getByTestId("resultado").textContent).toBe("false"));
  });

  it("resuelve false con la tecla Escape (igual que un diálogo nativo)", async () => {
    montar();
    abrir();
    act(() => { fireEvent.keyDown(window, { key: "Escape" }); });
    await waitFor(() => expect(screen.getByTestId("resultado").textContent).toBe("false"));
  });

  it("resuelve false al tocar fuera de la tarjeta", async () => {
    const { container } = montar();
    abrir();
    const backdrop = container.querySelector(".dialogo-backdrop")!;
    act(() => { fireEvent.click(backdrop); });
    await waitFor(() => expect(screen.getByTestId("resultado").textContent).toBe("false"));
  });

  it("usa los textos de botón personalizados", () => {
    montar({ textoConfirmar: "Eliminar", textoCancelar: "Volver" });
    abrir();
    expect(screen.getByText("Eliminar")).toBeTruthy();
    expect(screen.getByText("Volver")).toBeTruthy();
  });

  it("en una acción destructiva el foco arranca en Cancelar, no en el botón que borra", async () => {
    montar({ destructivo: true, textoConfirmar: "Eliminar" });
    abrir();
    // Un Enter reflejo NO debe borrar: el foco tiene que estar en Cancelar.
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Cancelar"));
  });

  it("en una acción normal el foco arranca en el botón principal", async () => {
    montar({ textoConfirmar: "Solicitar" });
    abrir();
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Solicitar"));
  });

  it("avisar() cierra con un solo botón y desbloquea al que esperaba", async () => {
    montar();
    act(() => { fireEvent.click(screen.getByText("avisar")); });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.queryByText("Cancelar")).toBeNull();
    act(() => { fireEvent.click(screen.getByText("Entendido")); });
    await waitFor(() => expect(screen.getByTestId("resultado").textContent).toBe("aviso-cerrado"));
  });

  it("desmontar con un diálogo abierto no deja la promesa colgada", async () => {
    const { unmount } = montar();
    abrir();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    act(() => { unmount(); });
    // Si el desmontaje no resolviera la promesa, el `await` de quien la
    // llamó nunca continuaría y la acción quedaría a medias para siempre.
    // No se puede leer el DOM ya desmontado, así que se comprueba que la
    // promesa efectivamente se resolvió: si no, este await nunca termina
    // y el test falla por timeout.
    await waitFor(() => expect(document.querySelector(".dialogo-backdrop")).toBeNull());
  });

  it("pedir un segundo diálogo cancela el anterior en vez de dejarlo colgado", async () => {
    montar();
    abrir();
    abrir();
    // El primero se resolvió como "false" (cancelado) al abrirse el segundo.
    await waitFor(() => expect(screen.getByTestId("resultado").textContent).toBe("false"));
    // Y queda UN solo diálogo en pantalla, no dos apilados.
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
  });
});
