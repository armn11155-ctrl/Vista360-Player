import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { exigirRitmo, reiniciarLimitador, tamanoRecordado } from "../../functions/src/limitador.js";

/**
 * Ninguna función tenía tope de peticiones. Las que puede llamar un
 * cliente escriben en su propio documento, así que no filtran nada -- pero
 * cada llamada es una escritura facturable, y la cuota gratuita son 20.000
 * al día. Un bucle desde la consola del navegador la agota en segundos y la
 * aplicación empieza a cobrar para todos.
 */
const FUNCIONES = resolve(__dirname, "../../functions/src");
const leer = (f: string) => readFileSync(resolve(FUNCIONES, f), "utf-8");

describe("límite de peticiones por usuario", () => {
  beforeEach(() => {
    reiniciarLimitador();
    vi.useRealTimers();
  });

  it("deja pasar hasta el cupo y corta la siguiente", () => {
    for (let i = 0; i < 5; i++) {
      expect(() => exigirRitmo("cliente-1", "op", 5)).not.toThrow();
    }
    expect(() => exigirRitmo("cliente-1", "op", 5)).toThrow(/Demasiadas peticiones/);
  });

  it("responde resource-exhausted, no permission-denied", () => {
    // El usuario TIENE permiso; solo va rápido. Contestar "no tienes
    // permiso" mandaría al cliente a soporte por un problema que se
    // arregla esperando diez segundos.
    exigirRitmo("cliente-1", "op", 1);
    try {
      exigirRitmo("cliente-1", "op", 1);
      throw new Error("deberia haber lanzado");
    } catch (e: unknown) {
      expect((e as { code?: string }).code).toContain("resource-exhausted");
    }
  });

  it("el cupo de un usuario NO gasta el de otro", () => {
    // Si el limitador contara global, un cliente ruidoso dejaría fuera a
    // todos los demás: el ataque de coste se convertiría en caída total.
    for (let i = 0; i < 5; i++) exigirRitmo("cliente-1", "op", 5);
    expect(() => exigirRitmo("cliente-2", "op", 5)).not.toThrow();
  });

  it("el cupo de una operación NO gasta el de otra", () => {
    for (let i = 0; i < 5; i++) exigirRitmo("cliente-1", "subir", 5);
    expect(() => exigirRitmo("cliente-1", "visitar", 5)).not.toThrow();
  });

  it("la ventana se reabre al pasar el minuto", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) exigirRitmo("cliente-1", "op", 5);
    expect(() => exigirRitmo("cliente-1", "op", 5)).toThrow();
    vi.advanceTimersByTime(60_001);
    expect(() => exigirRitmo("cliente-1", "op", 5)).not.toThrow();
    vi.useRealTimers();
  });

  it("no se queda sin memoria con muchísimos usuarios distintos", () => {
    // El limitador guarda estado por usuario. Sin tope, el Map crece con
    // cada uid que llame y nunca se vacía: sería la fuga de memoria que
    // viene a evitar. 20.000 usuarios distintos deben caber sin reventar.
    for (let i = 0; i < 20_000; i++) exigirRitmo(`u${i}`, "op", 5);
    // Lo que importa no es que no reviente (20.000 entradas en un Map no
    // revientan nada): es que el Map esté ACOTADO. Sin esta medida, una
    // prueba que solo mire que no falla pasa igual con la fuga puesta.
    expect(tamanoRecordado()).toBeLessThanOrEqual(5_000);
    // Y el limitador debe seguir funcionando después.
    for (let i = 0; i < 5; i++) exigirRitmo("nuevo", "op", 5);
    expect(() => exigirRitmo("nuevo", "op", 5)).toThrow();
  });

  it("TODA función que pueda llamar un cliente tiene tope", () => {
    // Red de seguridad para las funciones que se añadan mañana: si una
    // nueva onCall queda abierta a clientes sin exigirRitmo, esto falla.
    const sinTope: string[] = [];
    for (const archivo of readdirSync(FUNCIONES).filter((f) => f.endsWith(".ts"))) {
      const codigo = leer(archivo);
      if (!codigo.includes("onCall")) continue;
      const soloInterno =
        /role\b[^;]*(!==|===)\s*"admin"|esPersonalInterno|esAdminPortal|esGerente/.test(codigo);
      if (soloInterno) continue;
      if (!codigo.includes("exigirRitmo")) sinTope.push(archivo);
    }
    expect(sinTope).toEqual([]);
  });
});
