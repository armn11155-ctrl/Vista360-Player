import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * COMPROBADO EN PRODUCCION con una sesion de Trabajador real.
 *
 * El menu filtraba los elementos `adminOnly` por `isAdmin`. Pero en esta
 * aplicacion `isAdmin` NO significa "es el Gerente": App.tsx lo pasa como
 * `isAdmin={!adminVistaCliente}`, o sea "no esta mirando como cliente".
 * Es verdadero para CUALQUIER cuenta interna, incluido el Trabajador.
 *
 * Resultado: al Trabajador le aparecia "Analitica de acceso", entraba, y
 * las reglas de Firestore le contestaban "Missing or insufficient
 * permissions" en ingles y en rojo. La seguridad funcionaba -- el backend
 * denegaba -- pero la interfaz le enseñaba una puerta cerrada.
 */
const RAIZ = resolve(__dirname, "../..");
const sidebar = readFileSync(resolve(RAIZ, "src/components/Sidebar.tsx"), "utf-8");
const app = readFileSync(resolve(RAIZ, "src/App.tsx"), "utf-8");

describe("el menú no ofrece al Trabajador lo que es del Gerente", () => {
  it("adminOnly se filtra por esGerente, no por isAdmin", () => {
    expect(sidebar).toContain("!it.adminOnly || esGerente");
    expect(sidebar).not.toContain("!it.adminOnly || isAdmin");
  });

  it("esGerente significa de verdad el rol admin", () => {
    // Si alguien lo redefine como 'es interno', vuelve el fallo.
    expect(app).toContain('const esGerente = auth.role === "admin";');
  });

  it("isAdmin NO es un indicador de rol, y por eso no sirve para esto", () => {
    // Documenta la trampa: se llama isAdmin pero significa otra cosa.
    expect(app).toContain("isAdmin={!adminVistaCliente}");
  });

  it("Analítica sigue marcada como adminOnly", () => {
    const linea = sidebar.split("\n").find((l) => l.includes('id: "analitica"')) ?? "";
    expect(linea).toContain("adminOnly: true");
  });
});
