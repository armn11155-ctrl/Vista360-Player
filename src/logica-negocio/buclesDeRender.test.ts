import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * BUCLES DE RENDERIZADO: el fallo sin sintomas.
 *
 * Un hook que devuelve un array o un objeto NUEVO en cada render, y que
 * acaba en las dependencias de un useEffect que hace setState, produce
 * un bucle infinito: efecto -> setState -> render -> objeto nuevo ->
 * efecto...
 *
 * Y no se ve. No hay error. El DOM ni se mueve, porque React
 * re-renderiza y produce exactamente lo mismo. Lo unico que falla son
 * las TRANSICIONES: son interrumpibles, y un bucle de renders las
 * interrumpe sin descanso, asi que NUNCA se completan.
 *
 * En la practica: pulsas un boton de la barra inferior y no pasa nada,
 * pero el menu lateral (que no usa transicion) abre perfectamente. Se
 * midio en produccion: bloqueos de 674 ms y 749 ms del hilo principal
 * con CERO mutaciones del DOM.
 */

const HOOKS = resolve(__dirname, "../hooks");
const contratos = readFileSync(resolve(HOOKS, "useContratos.ts"), "utf-8");
const app = readFileSync(resolve(__dirname, "../App.tsx"), "utf-8");

describe("los hooks del resumen devuelven referencias estables", () => {
  it("useContratos memoiza el filtrado", () => {
    // .filter() crea un array nuevo cada vez. Sin useMemo, ese array
    // llega a las dependencias del efecto de useNotificaciones.
    // Se corta en la funcion SIGUIENTE, no por numero de caracteres: el
    // comentario que explica por que existe este useMemo es largo, y un
    // recorte fijo se lo comia.
    const desde = contratos.indexOf("export function useContratos(");
    const hasta = contratos.indexOf("export function ", desde + 10);
    const bloque = contratos.slice(desde, hasta === -1 ? undefined : hasta);
    expect(bloque).toContain("return useMemo(");
    expect(bloque).toContain("}, [state]);");
  });

  it("useContratosHistoricos y useSolicitudesDelCliente también", () => {
    for (const nombre of ["useContratosHistoricos", "useSolicitudesDelCliente"]) {
      const i = contratos.indexOf(`export function ${nombre}(`);
      expect(i, `no se encontró ${nombre}`).toBeGreaterThan(-1);
      expect(contratos.slice(i, i + 600)).toContain("return useMemo(");
    }
  });

  it("NINGUNO devuelve un objeto construido fuera de useMemo", () => {
    // Patrón peligroso: `return { status: "ready", ... };` suelto en el
    // cuerpo del hook, sin memoizar.
    const exportados = contratos.split("export function ").slice(1);
    for (const bloque of exportados) {
      const nombre = bloque.slice(0, bloque.indexOf("("));
      if (!nombre.startsWith("use")) continue;
      const sueltos = bloque.match(/^ {2}return \{ status:/gm) ?? [];
      expect(sueltos, `${nombre} devuelve un objeto sin memoizar`).toEqual([]);
    }
  });
});

describe("App.tsx no crea arrays nuevos en cada render", () => {
  it("usa vacíos compartidos, no `: []` en el render", () => {
    expect(app).toContain("const SIN_CONTRATOS: Contrato[] = [];");
    expect(app).toContain("const SIN_SOLICITUDES: SolicitudCampana[] = [];");
    expect(app).not.toMatch(/contratosState\.contratos : \[\]/);
    expect(app).not.toMatch(/solicitudesCliente\.solicitudes : \[\]/);
  });

  it("y los memoiza", () => {
    expect(app).toContain("const contratos = useMemo(");
    expect(app).toContain("const misSolicitudes = useMemo(");
  });
});
