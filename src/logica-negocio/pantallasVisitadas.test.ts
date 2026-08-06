import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PANTALLAS_VALIDAS } from "../hooks/useRegistrarVisita";

/**
 * La lista de pantallas que se cuentan está DUPLICADA: una en el
 * navegador (para no llamar en balde) y otra en el servidor (la
 * validación de verdad). No se puede compartir el código porque
 * functions/ compila como un proyecto aparte.
 *
 * Duplicar una lista es exactamente el tipo de cosa que se desincroniza
 * sola: alguien agrega una pantalla nueva, la pone en un lado y olvida
 * el otro. El síntoma sería silencioso -- esa pantalla simplemente
 * nunca aparecería en la Analítica, o se gastarían llamadas al servidor
 * que este rechaza. Nadie lo notaría en meses.
 */

const servidor = readFileSync(
  resolve(__dirname, "../../functions/src/registrarVisita.ts"),
  "utf-8"
);

function pantallasDelServidor(): Set<string> {
  const bloque = servidor.slice(
    servidor.indexOf("const PANTALLAS_VALIDAS"),
    servidor.indexOf("]", servidor.indexOf("const PANTALLAS_VALIDAS"))
  );
  return new Set(Array.from(bloque.matchAll(/"([a-z]+)"/g)).map((m) => m[1]));
}

describe("la lista de pantallas del navegador y la del servidor no pueden separarse", () => {
  it("el servidor declara una lista que se puede leer", () => {
    expect(pantallasDelServidor().size).toBeGreaterThan(5);
  });

  it("son EXACTAMENTE las mismas", () => {
    expect([...PANTALLAS_VALIDAS].sort()).toEqual([...pantallasDelServidor()].sort());
  });

  it("ninguna pantalla del navegador falta en el servidor (se gastarían llamadas rechazadas)", () => {
    const enServidor = pantallasDelServidor();
    const sobran = [...PANTALLAS_VALIDAS].filter((p) => !enServidor.has(p));
    expect(sobran).toEqual([]);
  });

  it("ninguna pantalla del servidor falta en el navegador (nunca se contaría)", () => {
    const faltan = [...pantallasDelServidor()].filter((p) => !PANTALLAS_VALIDAS.has(p));
    expect(faltan).toEqual([]);
  });

  it("el servidor acepta un lote y conserva compatibilidad con una sola pantalla", () => {
    expect(servidor).toContain("Array.isArray(request.data?.pantallas)");
    expect(servidor).toContain("[request.data?.pantalla]");
    expect(servidor).toContain("new Set(recibidas");
  });

  it("el navegador ya NO escribe directo en portalUsers (donde vive el rol)", () => {
    // Si alguien volviera a poner un updateDoc acá, las reglas de
    // Firestore tendrían que volver a permitir escritura del cliente
    // sobre el documento que guarda si es admin o no.
    // Se quitan los comentarios: los propios hooks EXPLICAN por qué ya
    // no escriben en portalUsers, y esa mención no debe contar como uso.
    const sinComentarios = (texto: string) =>
      texto
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n");

    const hookVisita = sinComentarios(readFileSync(resolve(__dirname, "../hooks/useRegistrarVisita.ts"), "utf-8"));
    const hookAcceso = sinComentarios(readFileSync(resolve(__dirname, "../hooks/useRegistrarAcceso.ts"), "utf-8"));
    for (const codigo of [hookVisita, hookAcceso]) {
      expect(codigo).not.toContain("updateDoc");
      expect(codigo).not.toContain("portalUsers");
      expect(codigo).toContain("httpsCallable");
    }
  });
});
