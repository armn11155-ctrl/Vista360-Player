import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * CICLO DE VIDA del resumen del cliente.
 *
 * Este hook alimenta la pantalla principal, así que un estado "cargando"
 * que no termine nunca deja a la persona mirando un spinner. Los tests
 * de texto (escalabilidad.test.ts) comprueban QUÉ consultas se hacen;
 * estos comprueban que la máquina de estados SIEMPRE sale de "loading",
 * pase lo que pase: el documento no existe, no hay permiso, una de las
 * dos consultas del respaldo falla, o simplemente nadie contesta.
 */

const listeners: Array<{ tipo: string; onNext: Function; onError: Function; cortado: boolean }> = [];

vi.mock("../config/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: (_d: unknown, n: string) => ({ __col: n }),
  doc: (_d: unknown, p: string) => ({ __doc: p }),
  query: (c: any) => c,
  where: () => ({}),
  onSnapshot: (ref: any, onNext: Function, onError: Function) => {
    const l = { tipo: ref.__doc ?? ref.__col, onNext, onError, cortado: false };
    listeners.push(l);
    return () => { l.cortado = true; };
  },
}));

import { renderHook, act } from "@testing-library/react";
import { useContratos, useSolicitudesDelCliente } from "../hooks/useContratos";

function snapDeAgregado(existe: boolean, datos?: unknown) {
  return { exists: () => existe, data: () => datos };
}
function snapDeColeccion(docs: unknown[]) {
  return { docs: docs.map((d: any) => ({ id: d.id, data: () => d })) };
}

describe("ciclo de vida del resumen del cliente", () => {
  beforeEach(() => { listeners.length = 0; });

  it("CASO REAL: el agregado no existe -> respaldo -> debe terminar en ready", () => {
    const { result } = renderHook(() => useContratos("cli-1"));
    expect(result.current.status).toBe("loading");

    const agregado = listeners.find((l) => l.tipo === "agregados/cliente-cli-1")!;
    act(() => { agregado.onNext(snapDeAgregado(false)); });

    const contratos = listeners.find((l) => l.tipo === "contratos")!;
    const solicitudes = listeners.find((l) => l.tipo === "solicitudesCampana")!;
    expect(contratos).toBeDefined();
    expect(solicitudes).toBeDefined();

    act(() => { contratos.onNext(snapDeColeccion([{ id: "c1", fin: "2099-01-01" }])); });
    // Solo ha llegado UNA de las dos: sigue cargando (correcto).
    expect(result.current.status).toBe("loading");

    act(() => { solicitudes.onNext(snapDeColeccion([])); });
    expect(result.current.status).toBe("ready");
  });

  it("FUGA: al caer al respaldo, la escucha del agregado debe cortarse", () => {
    renderHook(() => useContratos("cli-2"));
    const agregado = listeners.find((l) => l.tipo === "agregados/cliente-cli-2")!;
    act(() => { agregado.onNext(snapDeAgregado(false)); });
    expect(agregado.cortado).toBe(true);
  });

  it("dos hooks sobre el mismo cliente = UNA sola escucha", () => {
    renderHook(() => { useContratos("cli-3"); useSolicitudesDelCliente("cli-3"); });
    expect(listeners.filter((l) => l.tipo === "agregados/cliente-cli-3").length).toBe(1);
  });

  it("desmontar y volver a montar NO deja el estado colgado en loading", () => {
    const a = renderHook(() => useContratos("cli-4"));
    const ag = listeners.find((l) => l.tipo === "agregados/cliente-cli-4")!;
    act(() => { ag.onNext(snapDeAgregado(true, { contratos: [], solicitudes: [] })); });
    expect(a.result.current.status).toBe("ready");
    a.unmount();

    const b = renderHook(() => useContratos("cli-4"));
    const ag2 = listeners.filter((l) => l.tipo === "agregados/cliente-cli-4").pop()!;
    act(() => { ag2.onNext(snapDeAgregado(true, { contratos: [], solicitudes: [] })); });
    expect(b.result.current.status).toBe("ready");
  });
});

describe("ESCENARIO REAL: reglas sin publicar (permiso denegado)", () => {
  beforeEach(() => { listeners.length = 0; });

  it("permiso denegado en el resumen -> respaldo -> ready", () => {
    const { result } = renderHook(() => useContratos("cli-9"));
    const ag = listeners.find((l) => l.tipo === "agregados/cliente-cli-9")!;
    act(() => { ag.onError({ code: "permission-denied", message: "Missing or insufficient permissions." }); });

    const c = listeners.find((l) => l.tipo === "contratos");
    const s = listeners.find((l) => l.tipo === "solicitudesCampana");
    expect(c, "debe arrancar el respaldo de contratos").toBeDefined();
    expect(s, "debe arrancar el respaldo de solicitudes").toBeDefined();

    act(() => { c!.onNext(snapDeColeccion([])); s!.onNext(snapDeColeccion([])); });
    expect(result.current.status).toBe("ready");
  });

  it("si el respaldo de SOLICITUDES falla, no puede quedarse colgado", () => {
    // El admin lee contratos sin problema, pero si la otra consulta
    // fallara, juntar() nunca publica y la app se queda en el loader
    // TAPANDO TODA LA NAVEGACION.
    const { result } = renderHook(() => useContratos("cli-10"));
    const ag = listeners.find((l) => l.tipo === "agregados/cliente-cli-10")!;
    act(() => { ag.onError({ code: "permission-denied", message: "x" }); });
    const c = listeners.find((l) => l.tipo === "contratos")!;
    const s = listeners.find((l) => l.tipo === "solicitudesCampana")!;

    act(() => { c.onNext(snapDeColeccion([{ id: "c1", fin: "2099-01-01" }])); });
    act(() => { s.onError({ code: "permission-denied", message: "sin permiso" }); });

    // Debe resolverse de ALGUNA forma: con las campañas y sin las
    // solicitudes. Nunca quedarse en loading.
    expect(result.current.status).not.toBe("loading");
  });

  it("si el respaldo de CONTRATOS falla, tampoco", () => {
    const { result } = renderHook(() => useContratos("cli-11"));
    const ag = listeners.find((l) => l.tipo === "agregados/cliente-cli-11")!;
    act(() => { ag.onError({ code: "permission-denied", message: "x" }); });
    const c = listeners.find((l) => l.tipo === "contratos")!;
    act(() => { c.onError({ code: "permission-denied", message: "sin permiso" }); });
    expect(result.current.status).not.toBe("loading");
  });
});

describe("tope de espera: nunca cargando para siempre", () => {
  beforeEach(() => { listeners.length = 0; vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("si NADIE contesta, cae al respaldo por su cuenta", () => {
    // Ni onNext ni onError. Es el caso que ningun manejador cubre y el
    // que deja el spinner girando indefinidamente.
    const { result } = renderHook(() => useContratos("cli-20"));
    expect(result.current.status).toBe("loading");
    expect(listeners.filter((l) => l.tipo === "contratos").length).toBe(0);

    act(() => { vi.advanceTimersByTime(6000); });

    const c = listeners.find((l) => l.tipo === "contratos");
    expect(c, "el reloj de guardia debe arrancar el respaldo").toBeDefined();
    act(() => {
      c!.onNext(snapDeColeccion([]));
      listeners.find((l) => l.tipo === "solicitudesCampana")!.onNext(snapDeColeccion([]));
    });
    expect(result.current.status).toBe("ready");
  });

  it("si el resumen SI contesta, el reloj no dispara nada", () => {
    renderHook(() => useContratos("cli-21"));
    const ag = listeners.find((l) => l.tipo === "agregados/cliente-cli-21")!;
    act(() => { ag.onNext(snapDeAgregado(true, { contratos: [], solicitudes: [] })); });
    act(() => { vi.advanceTimersByTime(30000); });
    expect(listeners.filter((l) => l.tipo === "contratos").length).toBe(0);
  });
});

describe("el respaldo publica lo que tenga en vez de rendirse", () => {
  beforeEach(() => { listeners.length = 0; });

  it("con campañas pero sin solicitudes, se muestran las campañas", () => {
    const { result } = renderHook(() => useContratos("cli-30"));
    act(() => { listeners.find((l) => l.tipo === "agregados/cliente-cli-30")!.onError({ code: "permission-denied", message: "x" }); });
    act(() => { listeners.find((l) => l.tipo === "contratos")!.onNext(snapDeColeccion([{ id: "c1", fin: "2099-01-01" }])); });
    act(() => { listeners.find((l) => l.tipo === "solicitudesCampana")!.onError({ message: "sin permiso" }); });

    expect(result.current.status).toBe("ready");
    if (result.current.status === "ready") {
      expect(result.current.contratos).toHaveLength(1);
    }
  });

  it("sin campañas SÍ es error: no se puede seguir sin ellas", () => {
    const { result } = renderHook(() => useContratos("cli-31"));
    act(() => { listeners.find((l) => l.tipo === "agregados/cliente-cli-31")!.onError({ code: "permission-denied", message: "x" }); });
    act(() => { listeners.find((l) => l.tipo === "contratos")!.onError({ message: "sin permiso" }); });
    expect(result.current.status).toBe("error");
  });
});
