import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const leer = (ruta: string) => readFileSync(resolve(__dirname, "../..", ruta), "utf8");

describe("refinamiento premium aprobado", () => {
  it("integra marca y acceso en una sola arquitectura de login", () => {
    const login = leer("src/components/LoginScreen.tsx");
    expect(login).toContain('className="login-experience"');
    expect(login).toContain("Claridad en cada campaña.");
    expect(login).toContain("Publicidad exterior premium");
    expect(login).toContain("Marca, alcance e impacto");
    expect(login).toContain('className="login-brand-signal"');
    expect(login).toContain('className="login-access-kicker"');
    expect(login).toContain('className="login-remember-native"');
    expect(login).toContain('className="login-btn-spinner"');
    expect(login).not.toContain("tabIndex={-1}");
    expect(login).not.toContain('className="login-feature-visual"');
    expect(login).not.toContain('className="login-feature-stage"');
    expect(login).not.toContain('className="login-operation-line"');

    const estilos = leer("src/styles/design-system.css");
    expect(estilos).toContain("login-city-breathe");
    expect(estilos).toContain("login-vista360-desktop-v2.jpg");
    expect(estilos).toContain("login-signal-sweep");
    expect(estilos).toContain("login-divider-glide");
    expect(estilos).toContain(".login-message-stack");
    expect(estilos).toContain("-22px 0 54px -35px rgba(77,142,236,.64)");
    expect(estilos).toContain("18px 0 46px -29px rgba(77,142,236,.42)");
    expect(estilos).toContain("@media (max-width: 899px) and (max-height: 740px)");
  });

  it("usa controles semánticos para el filtro de campañas", () => {
    const campanas = leer("src/components/screens/MisCampanas.tsx");
    expect(campanas).toContain('role="tablist"');
    expect(campanas).toContain('role="tab"');
    expect(campanas).toContain("aria-selected={filtro === f}");
    expect(campanas).toContain("{filtradas.length > 0 && (");
  });

  it("expone visualmente qué panel está seleccionado en Cobertura", () => {
    const cobertura = leer("src/components/screens/Cobertura.tsx");
    expect(cobertura).toContain('" is-selected"');
    expect(cobertura).toContain("aria-pressed={seleccionado?.id === panel.id}");
  });

  it("mantiene fijo el login móvil cuando aparece el teclado", () => {
    const login = leer("src/components/LoginScreen.tsx");
    const estilos = leer("src/styles/design-system.css");
    const viewport = leer("src/utils/viewport-height.ts");
    expect(login).toContain("login-field-focused");
    expect(estilos).toContain(".login-shell.login-field-focused");
    expect(estilos).toContain("height: var(--visual-height, 100dvh)");
    expect(viewport).toContain("visualHeight || window.innerHeight || currentHeight");
  });

  it("alinea Inicio y deja la fotografía de Campañas sin franja lateral", () => {
    const inicio = leer("src/components/screens/Inicio.tsx");
    const estilosApp = leer("src/styles/app.css");
    const estilos = leer("src/styles/design-system.css");
    expect(inicio).not.toContain("top:10");
    expect(estilosApp).toContain("grid-row: 1 / span 2");
    expect(estilos).toContain(".inicio-side-col .inicio-evidence-card");
    expect(estilosApp).not.toContain(".premium-campaign-card::after");
    expect(estilosApp).toContain(".report-admin-panel + .reports-filter-stack");
    expect(estilosApp).toContain("url('/login-vista360-desktop-v2.jpg')");
  });
});
