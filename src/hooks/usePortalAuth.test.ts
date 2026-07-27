import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// Simula un usuario de Firebase Auth ya logueado. Cada test cambia
// `mockUserChangeCallback` para disparar el callback con este usuario.
const fakeUser = { uid: "uid-123", email: "cliente@empresa.com" } as any;

// doc/onSnapshot de firebase/firestore se mockean para no tocar Firestore
// real. Se guarda el callback del listener para poder simular, además de
// la carga inicial, un cambio POSTERIOR del documento (que es justamente
// lo que antes no funcionaba: el rol se leía una sola vez).
let firestoreDocData: Record<string, unknown> | null = null;
let firestoreDocExists = true;
let emitirSnapshot: (() => void) | null = null;

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  onSnapshot: vi.fn((_ref: unknown, onNext: (snap: unknown) => void) => {
    emitirSnapshot = () =>
      onNext({ exists: () => firestoreDocExists, data: () => firestoreDocData });
    emitirSnapshot();
    return () => { emitirSnapshot = null; };
  }),
}));

// onUserChange/db/auth de nuestro propio config/firebase se mockean para
// disparar manualmente el callback de "usuario logueado" en cada test,
// sin necesitar credenciales reales ni red.
let userChangeCb: ((user: unknown) => void) | null = null;

vi.mock("../config/firebase", () => ({
  db: {},
  auth: {},
  logout: vi.fn(async () => {}),
  onUserChange: (cb: (user: unknown) => void) => {
    userChangeCb = cb;
    return () => {};
  },
}));

import { usePortalAuth } from "./usePortalAuth";

describe("usePortalAuth — flujo de roles", () => {
  beforeEach(() => {
    userChangeCb = null;
    firestoreDocExists = true;
    firestoreDocData = null;
    emitirSnapshot = null;
  });

  it("rol 'cliente': recibe su clienteId fijo y no puede elegir otro", async () => {
    firestoreDocData = { role: "cliente", clienteId: "cliente-abc", nombre: "Alan" };

    const { result } = renderHook(() => usePortalAuth());
    userChangeCb!(fakeUser);

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
    userChangeCb!(fakeUser);

    await waitFor(() => expect(result.current.status).toBe("in"));

    const state = result.current;
    if (state.status !== "in") throw new Error("esperaba status 'in'");
    expect(state.role).toBe("admin");
    expect(state.clienteId).toBeNull();
  });

  it("cuenta sin documento en portalUsers: error explícito, no acceso silencioso", async () => {
    firestoreDocExists = false;

    const { result } = renderHook(() => usePortalAuth());
    userChangeCb!(fakeUser);

    await waitFor(() => expect(result.current.status).toBe("error"));

    const state = result.current;
    if (state.status !== "error") throw new Error("esperaba status 'error'");
    expect(state.message).toMatch(/no está vinculada/i);
  });

  it("sin usuario logueado: status 'out'", async () => {
    const { result } = renderHook(() => usePortalAuth());
    userChangeCb!(null);

    await waitFor(() => expect(result.current.status).toBe("out"));
  });

  it("el rol se actualiza EN VIVO, sin recargar", async () => {
    // Este es el bug que se arregló: antes el documento se leía una sola
    // vez con getDoc, así que cambiar el rol o archivar al usuario no
    // tenía efecto hasta que la persona recargara la app.
    firestoreDocData = { role: "cliente", clienteId: "cliente-abc", nombre: "Alan" };

    const { result } = renderHook(() => usePortalAuth());
    userChangeCb!(fakeUser);
    await waitFor(() => expect(result.current.status).toBe("in"));

    // El admin lo asciende mientras la sesión sigue abierta.
    firestoreDocData = { role: "admin", clienteId: null, nombre: "Alan" };
    emitirSnapshot!();

    await waitFor(() => {
      const s = result.current;
      if (s.status !== "in") throw new Error("esperaba 'in'");
      expect(s.role).toBe("admin");
    });
  });

  it("archivar al usuario en caliente lo saca de inmediato", async () => {
    firestoreDocData = { role: "cliente", clienteId: "cliente-abc" };

    const { result } = renderHook(() => usePortalAuth());
    userChangeCb!(fakeUser);
    await waitFor(() => expect(result.current.status).toBe("in"));

    firestoreDocData = { role: "cliente", clienteId: "cliente-abc", archived: true };
    emitirSnapshot!();

    await waitFor(() => expect(result.current.status).toBe("error"));
    const s = result.current;
    if (s.status !== "error") throw new Error("esperaba 'error'");
    expect(s.message).toMatch(/archivado/i);
  });
});
