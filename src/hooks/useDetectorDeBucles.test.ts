import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { anotarRutaActual, useDetectorDeBucles } from "./useDetectorDeBucles";

/**
 * ES LA ÚLTIMA LÍNEA DE DEFENSA, NO UNA ALFOMBRA.
 *
 * Un guardián que se dispara de más es peor que no tenerlo: se aprende a
 * ignorarlo y deja de avisar cuando de verdad hace falta. Estas pruebas
 * pesan tanto en el lado de "no se queja de lo normal" como en el de
 * "avisa cuando hay que avisar".
 */

let ahora = 1_000_000;
const avanzar = (ms: number) => { ahora += ms; };

function interactuar() {
  window.dispatchEvent(new Event("pointermove"));
}

describe("aviso de renders desbocados", () => {
  beforeEach(() => {
    ahora = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => ahora);
  });
  afterEach(() => vi.restoreAllMocks());

  /** Simula N renders repartidos a lo largo de `msTotal`. */
  function renderizar(rerender: () => void, n: number, msTotal: number) {
    for (let i = 0; i < n; i++) {
      avanzar(msTotal / n);
      rerender();
    }
  }

  it("NO se queja de un uso intenso pero con interacción", () => {
    // Arrastrar el marcador del mapa, redimensionar la ventana o
    // escribir rápido produce decenas de renders por segundo. Es sano.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = renderHook(() => useDetectorDeBucles("Prueba"));
    for (let ventana = 0; ventana < 6; ventana++) {
      interactuar();
      renderizar(rerender, 100, 1000);
    }
    expect(error).not.toHaveBeenCalled();
  });

  it("NO se queja de un pico aislado sin interacción", () => {
    // Montar una pantalla o recibir varios datos de golpe da un pico.
    // Un bucle no para; un pico sí.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = renderHook(() => useDetectorDeBucles("Prueba"));
    renderizar(rerender, 200, 1000);
    avanzar(3000);
    rerender();
    expect(error).not.toHaveBeenCalled();
  });

  it("SÍ avisa: ritmo alto, sostenido y sin que nadie toque nada", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = renderHook(() => useDetectorDeBucles("Prueba"));
    avanzar(SILENCIO_SUFICIENTE);
    for (let ventana = 0; ventana < 5; ventana++) renderizar(rerender, 200, 1000);
    expect(error).toHaveBeenCalled();
  });

  it("deja de considerarlo bucle si la persona vuelve a tocar", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = renderHook(() => useDetectorDeBucles("Prueba"));
    avanzar(SILENCIO_SUFICIENTE);
    // Dos ventanas intensas (aún no llega al mínimo de 3)...
    for (let v = 0; v < 2; v++) renderizar(rerender, 200, 1000);
    // ...y entonces la persona interactúa.
    interactuar();
    renderizar(rerender, 200, 1000);
    expect(error).not.toHaveBeenCalled();
  });

  it("una ventana tranquila en medio ROMPE la racha", () => {
    // Sin interacción de por medio: dos ventanas intensas, una tranquila,
    // dos intensas. Nunca hay tres seguidas, así que no es un bucle --
    // un bucle no se toma respiros. Si el contador no se reiniciara,
    // cualquier aplicación acabaría avisando con el tiempo.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = renderHook(() => useDetectorDeBucles("Prueba"));
    avanzar(SILENCIO_SUFICIENTE);
    renderizar(rerender, 200, 1000);
    renderizar(rerender, 200, 1000);
    renderizar(rerender, 5, 1000);   // ventana tranquila
    renderizar(rerender, 200, 1000);
    renderizar(rerender, 200, 1000);
    expect(error).not.toHaveBeenCalled();
  });

  it("avisa UNA sola vez, no en cada render", () => {
    // Escribir en cada render llenaría la consola y encima empeoraría el
    // problema: el propio console.error cuesta tiempo.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = renderHook(() => useDetectorDeBucles("Prueba"));
    avanzar(SILENCIO_SUFICIENTE);
    for (let v = 0; v < 12; v++) renderizar(rerender, 200, 1000);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("el aviso trae con qué diagnosticar, y NADA sensible", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    anotarRutaActual("cobertura");
    const { rerender } = renderHook(() => useDetectorDeBucles("AuthenticatedApp"));
    avanzar(SILENCIO_SUFICIENTE);
    for (let v = 0; v < 5; v++) renderizar(rerender, 200, 1000);

    const datos = error.mock.calls[0][1] as Record<string, unknown>;
    expect(datos.componente).toBe("AuthenticatedApp");
    expect(datos.pantalla).toBe("cobertura");
    expect(datos.ventanasSeguidas).toBeGreaterThanOrEqual(3);
    expect(datos.segundosSinInteraccion).toBeGreaterThanOrEqual(2);

    // Nada de identificadores ni contenido: esto acaba en la consola de
    // cualquiera que abra las herramientas de desarrollo.
    // Se comprueban los VALORES, no el texto explicativo: la frase de
    // ayuda menciona "useEffect", y buscar "uid" dentro de ella daba un
    // falso positivo tonto.
    const valores = Object.entries(datos)
      .filter(([clave]) => clave !== "queSignifica")
      .map(([, valor]) => String(valor))
      .join(" | ");
    expect(valores).not.toMatch(/clienteId|cliente_id|uid|email|ruc|empresa|@/i);
    // Y el aviso solo lleva estas claves, ninguna más.
    expect(Object.keys(datos).sort()).toEqual([
      "componente",
      "pantalla",
      "queSignifica",
      "rendersEnLaUltimaVentana",
      "segundosSinInteraccion",
      "ventanasSeguidas",
    ]);
  });

  it("está enchufado en los dos componentes con estado", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { resolve } = require("node:path") as typeof import("node:path");
    const app = readFileSync(resolve(__dirname, "../App.tsx"), "utf-8");
    expect(app).toContain('useDetectorDeBucles("App")');
    expect(app).toContain('useDetectorDeBucles("AuthenticatedApp")');
    expect(app).toContain("anotarRutaActual(view)");
  });
});

/** Más que el silencio exigido, para que el reloj no lo confunda. */
const SILENCIO_SUFICIENTE = 5000;
