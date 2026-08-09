import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const leer = (ruta: string) => readFileSync(resolve(__dirname, "../..", ruta), "utf8");

describe("refinamiento premium aprobado", () => {
  it("integra marca y acceso en una sola arquitectura de login", () => {
    const login = leer("src/components/LoginScreen.tsx");
    expect(login).toContain('className="login-experience"');
    expect(login).toContain("Campañas bajo control.");
    expect(login).toContain('className="login-access-kicker"');
    expect(login).not.toContain('className="login-feature-visual"');
    expect(login).not.toContain('className="login-feature-stage"');
    expect(login).not.toContain('className="login-operation-line"');
  });

  it("usa controles semánticos para el filtro de campañas", () => {
    const campanas = leer("src/components/screens/MisCampanas.tsx");
    expect(campanas).toContain('role="tablist"');
    expect(campanas).toContain('role="tab"');
    expect(campanas).toContain("aria-selected={filtro === f}");
  });

  it("expone visualmente qué panel está seleccionado en Cobertura", () => {
    const cobertura = leer("src/components/screens/Cobertura.tsx");
    expect(cobertura).toContain('" is-selected"');
    expect(cobertura).toContain("aria-pressed={seleccionado?.id === panel.id}");
  });

  it("no añade cambios de Inicio dentro de esta pasada", () => {
    const estilos = leer("src/styles/design-system.css");
    const refinamiento = estilos.split("EXPERIENCIA PREMIUM APROBADA")[1] ?? "";
    expect(refinamiento).not.toContain(".inicio-");
  });
});
