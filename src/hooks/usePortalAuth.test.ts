import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

// Simula un usuario de Firebase Auth ya logueado. Cada test cambia
// `mockUserChangeCallback` para disparar el callback con este usuario.
const fakeUser = { uid: "uid-123", email: "cliente@empresa.com" } as any;

// doc/getDoc de firebase/firestore se mockean para no tocar Firestore real.
// Cada llamada devuelve los datos vigentes para poder simular una
// revalidación cuando la persona vuelve a la PWA.
let firestoreDocData: Record<string, unknown> | null = null;
let firestoreDocExists = true;

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(async () => ({
    exists: () => firestoreDocExists,
    data: () => firestoreDocData,
  })),
}));

// onUserChange/db/auth de nuestro propio config/firebase se mockean para
// disparar manualmente el callback de "usuario logueado" en cada test,
// sin necesitar credenciales reales ni red.
let userChangeCb: ((user: unknown) => void | Promise<void>) | null = null;

vi.mock("../config/firebase", () => ({
  db: {},
  auth: {},
  logout: vi.fn(async () => {}),
  onUserChange: (cb: (user: unknown) => void | Promise<void>) => {
    userChangeCb = cb;
    return () => {};
  },
}));

import { usePortalAuth } from "./usePortalAuth";

describe("usePortalAuth — flujo de roles", () => {
  let ahora = 1_000;

  beforeEach(() => {
    userChangeCb = null;
    firestoreDocExists = true;
    firestoreDocData = null;
    ahora = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => ahora);
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it("rol 'cliente': recibe su clienteId fijo y no puede elegir otro", async () => {
    firestoreDocData = { role: "cliente", clienteId: "cliente-abc", nombre: "Alan" };

    const { result } = renderHook(() => usePortalAuth());
    await act(async () => { await userChangeCb!(fakeUser); });

    await waitFor(() => expect(result.current.status).toBe("in"));

    const state = result.current;
    if (state.status !== "in") throw new Error("esperaba status 'in'");
    expect(state.role).toBe("cliente");
    expect(state.clienteId).toBe("cliente-abc");
  });

  it("rol 'admin': clienteId siempre es null (elige cliente desde el selector, no queda fijo)", async () => {
    // Aunque el documento tuviera un clienteId por error, el rol admin
    // debe ignorarlo — el admin ve el selector, nunca queda atado a un
    // cliente por accidente en la carga inicial.
    firestoreDocData = { role: "admin", clienteId: "cliente-abc", nombre: "Dueño" };

    const { result } = renderHook(() => usePortalAuth());
    await act(async () => { await userChangeCb!(fakeUser); });

    await waitFor(() => expect(result.current.status).toBe("in"));

    const state = result.current;
    if (state.status !== "in") throw new Error("esperaba status 'in'");
    expect(state.role).toBe("admin");
    expect(state.clienteId).toBeNull();
  });

  it("cuenta sin documento en portalUsers: error explícito, no acceso silencioso", async () => {
    firestoreDocExists = false;

    const { result } = renderHook(() => usePortalAuth());
    await act(async () => { await userChangeCb!(fakeUser); });

    await waitFor(() => expect(result.current.status).toBe("error"));

    const state = result.current;
    if (state.status !== "error") throw new Error("esperaba status 'error'");
    expect(state.message).toMatch(/no está vinculada/i);
  });

  it("sin usuario logueado: status 'out'", async () => {
    const { result } = renderHook(() => usePortalAuth());
    await act(async () => { await userChangeCb!(null); });

    await waitFor(() => expect(result.current.status).toBe("out"));
  });

  it("el rol se revalida al volver a la app, sin recargar", async () => {
    firestoreDocData = { role: "cliente", clienteId: "cliente-abc", nombre: "Alan" };

    const { result } = renderHook(() => usePortalAuth());
    await act(async () => { await userChangeCb!(fakeUser); });
    await waitFor(() => expect(result.current.status).toBe("in"));

    // El admin lo asciende y la persona vuelve a enfocar la PWA después
    // de la ventana de cinco minutos.
    firestoreDocData = { role: "admin", clienteId: null, nombre: "Alan" };
    ahora += 5 * 60_000 + 1;
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    await waitFor(() => {
      const s = result.current;
      if (s.status !== "in") throw new Error("esperaba 'in'");
      expect(s.role).toBe("admin");
    });
  });

  it("archivar al usuario lo saca al regresar a la PWA", async () => {
    firestoreDocData = { role: "cliente", clienteId: "cliente-abc" };

    const { result } = renderHook(() => usePortalAuth());
    await act(async () => { await userChangeCb!(fakeUser); });
    await waitFor(() => expect(result.current.status).toBe("in"));

    firestoreDocData = { role: "cliente", clienteId: "cliente-abc", archived: true };
    ahora += 5 * 60_000 + 1;
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.status).toBe("error"));
    const s = result.current;
    if (s.status !== "error") throw new Error("esperaba 'error'");
    expect(s.message).toMatch(/archivado/i);
  });
});
