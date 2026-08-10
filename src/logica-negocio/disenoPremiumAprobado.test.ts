import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const leer = (ruta: string) => readFileSync(resolve(__dirname, "../..", ruta), "utf8");

describe("refinamiento premium aprobado", () => {
  it("integra marca y acceso en una sola arquitectura de login", () => {
    const login = leer("src/components/LoginScreen.tsx");
    expect(login).toContain('className="login-experience"');
    expect(login).toContain("Más que visibilidad. Presencia.");
    expect(login).toContain("Publicidad exterior premium");
    expect(login).toContain("Marca, alcance e impacto");
    expect(login).toContain('className="login-brand-signal"');
    expect(login).toContain('className="login-led-screen"');
    expect(login).toContain("login-led-frame-impact");
    expect(login).toContain('className="login-access-kicker"');
    expect(login).toContain('className="login-remember-native"');
    expect(login).toContain('className="login-btn-spinner"');
    expect(login).not.toContain("tabIndex={-1}");
    expect(login).not.toContain('className="login-feature-visual"');
    expect(login).not.toContain('className="login-feature-stage"');
    expect(login).not.toContain('className="login-operation-line"');

    const estilos = leer("src/styles/design-system.css");
    expect(estilos).toContain("login-city-breathe");
    expect(estilos).toContain("filter: brightness(1.085) saturate(1.035)");
    expect(estilos).toContain("max-width: 100vw");
    expect(estilos).toContain("login-vista360-desktop-v3.jpg");
    expect(estilos).toContain("width: min(1160px, 100%)");
    expect(estilos).toContain("transform: translateY(-20px)");
    expect(estilos).toContain("login-signal-sweep");
    expect(estilos).toContain("login-divider-glide");
    expect(estilos).toContain("login-led-perimeter");
    expect(estilos).toContain("login-led-brand-frame");
    expect(estilos).toContain("login-led-keyword-marca");
    expect(estilos).toContain("login-led-keyword-alcance");
    expect(estilos).toContain("login-led-keyword-impacto");
    expect(estilos).toContain(".login-message-stack");
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
    expect(login).toContain("login-keyboard-open");
    expect(estilos).toContain(".login-shell.login-field-focused");
    expect(estilos).toContain("body.login-keyboard-open");
    expect(estilos).toContain("touch-action: none");
    expect(estilos).toContain("font-size: 16px");
    expect(estilos).toContain("top: var(--visual-offset-top, 0px)");
    expect(estilos).toContain("width: var(--visual-width, 100vw)");
    expect(estilos).toContain("height: var(--visual-height, 100dvh)");
    expect(viewport).toContain("visualHeight || window.innerHeight || currentHeight");
    expect(viewport).toContain('setProperty("--visual-offset-top"');
    expect(viewport).toContain('addEventListener("scroll", set)');
    expect(login).not.toContain("window.scrollTo(0, 0)");
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
    expect(estilosApp).toContain("url('/login-vista360-desktop-v3.jpg')");
    expect(estilosApp).toContain("url('/selector-clientes-atardecer-mobile.jpg')");
    expect(estilosApp).toContain("url('/selector-clientes-atardecer-desktop.jpg')");
  });

  it("muestra completa y suaviza la curva inversa de Perfil", () => {
    const perfil = leer("src/components/screens/Perfil.tsx");
    const estilos = leer("src/styles/app.css");
    expect(perfil).toContain('viewBox="0 0 438 38"');
    expect(perfil).toContain("M0 1.5 C0 20.5 15.5 36 34.5 36 H403.5 C422.5 36 438 20.5 438 1.5");
    expect(estilos).toContain(".profile-top-curve");
    expect(estilos).toContain("left: -2px");
    expect(estilos).toContain("right: -2px");
    expect(estilos).toContain("stroke-linejoin: round");
  });

  it("refina documentos, cobertura y navegación solo en escritorio", () => {
    const facturas = leer("src/components/screens/Facturas.tsx");
    const sidebar = leer("src/components/Sidebar.tsx");
    const estilos = leer("src/styles/app.css");
    const sistema = leer("src/styles/design-system.css");
    expect(facturas).toContain('className="facturas-month-group"');
    expect(sidebar).toContain('label: "Perfil", desktopOnly: true');
    expect(sidebar).toContain("onNavigate(it.id)");
    expect(sidebar).not.toContain('it.id === "perfil" && onOpenPerfil');
    expect(sidebar).not.toContain('active === "miPerfil"');
    expect(estilos).toContain(".facturas-history-screen-body > .reports-filter-bar + .facturas-month-group");
    expect(estilos).toContain(".coverage-panel-row:not(:last-child)::after");
    expect(estilos).toContain(".profile-top-curve");
    expect(estilos).toContain("display: none !important");
    expect(sistema).toContain(".coverage-selected-card::before");
    expect(sistema).toContain("top: 14px");
    expect(sistema).toContain("border-radius: 999px");
  });

  it("añade jerarquía operativa con datos que las pantallas ya cargaron", () => {
    const detalle = leer("src/components/screens/DetalleCampana.tsx");
    const paneles = leer("src/components/screens/Paneles.tsx");
    const solicitudes = leer("src/components/screens/SolicitudesCampana.tsx");
    const analitica = leer("src/components/screens/AnaliticaClientes.tsx");
    const estilos = leer("src/styles/app.css");
    expect(detalle).toContain('className="campaign-period-rail"');
    expect(paneles).toContain('className="panel-status-legend"');
    expect(paneles).toContain("for (const panel of panelesTodos)");
    expect(solicitudes).toContain("request-priority-row");
    expect(analitica).toContain("analytics-summary");
    expect(estilos).toContain("ACABADO OPERATIVO PREMIUM");
  });
});
