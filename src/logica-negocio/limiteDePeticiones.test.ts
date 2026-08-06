import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { reiniciarLimitador, superaElRitmo, tamanoRecordado } from "../../functions/src/validaciones.js";

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
      expect(superaElRitmo("cliente-1", "op", 5)).toBe(false);
    }
    expect(superaElRitmo("cliente-1", "op", 5)).toBe(true);
  });

  it("el cupo de un usuario NO gasta el de otro", () => {
    // Si el limitador contara global, un cliente ruidoso dejaría fuera a
    // todos los demás: el ataque de coste se convertiría en caída total.
    for (let i = 0; i < 5; i++) superaElRitmo("cliente-1", "op", 5);
    expect(superaElRitmo("cliente-2", "op", 5)).toBe(false);
  });

  it("el cupo de una operación NO gasta el de otra", () => {
    for (let i = 0; i < 5; i++) superaElRitmo("cliente-1", "subir", 5);
    expect(superaElRitmo("cliente-1", "visitar", 5)).toBe(false);
  });

  it("la ventana se reabre al pasar el minuto", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) superaElRitmo("cliente-1", "op", 5);
    expect(superaElRitmo("cliente-1", "op", 5)).toBe(true);
    vi.advanceTimersByTime(60_001);
    expect(superaElRitmo("cliente-1", "op", 5)).toBe(false);
    vi.useRealTimers();
  });

  it("no se queda sin memoria con muchísimos usuarios distintos", () => {
    for (let i = 0; i < 20_000; i++) superaElRitmo(`u${i}`, "op", 5);
    // Lo que importa no es que no reviente (20.000 entradas en un Map no
    // revientan nada): es que el Map esté ACOTADO. Sin esta medida, una
    // prueba que solo mire que no falla pasa igual con la fuga puesta.
    expect(tamanoRecordado()).toBeLessThanOrEqual(5_000);
    // Y el limitador debe seguir funcionando después.
    for (let i = 0; i < 5; i++) superaElRitmo("nuevo", "op", 5);
    expect(superaElRitmo("nuevo", "op", 5)).toBe(true);
  });

  it("el envoltorio responde resource-exhausted, no permission-denied", () => {
    // exigirRitmo no se puede EJECUTAR desde acá: importa HttpsError, y
    // arrastrarlo rompería el despliegue de Cloudflare (ver validaciones.ts).
    // Es un envoltorio de tres líneas, así que se comprueba leyéndolo: el
    // usuario TIENE permiso, solo va rápido. Contestar "no tienes permiso"
    // lo mandaría a soporte por algo que se arregla esperando.
    const codigo = leer("limitador.ts");
    expect(codigo).toContain("superaElRitmo(uid, operacion, maxPorMinuto)");
    expect(codigo).toContain('"resource-exhausted"');
    expect(codigo).not.toContain('"permission-denied"');
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
