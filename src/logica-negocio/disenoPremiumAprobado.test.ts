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
    expect(login).toContain("Campañas, cobertura y resultados conectados");
    expect(login).toContain('className="login-network-stage"');
    expect(login).toContain("import PixelGlobe");
    expect(login).toContain("<PixelGlobe />");
    expect(login).not.toContain("login-network-label-coverage");
    expect(login).not.toContain("login-network-label-results");
    expect(login).not.toContain("login-network-visual-brand");
    expect(login).not.toContain("v360-word-dots");
    expect(login).not.toContain("login-network-visual-billboard");
    expect(login).not.toContain("login-billboard-code-frame");
    expect(login).not.toContain("login-network-index");
    expect(login).toContain("Red de campaña activa");
    expect(login).toContain('className="login-network-message"');
    expect(login).toContain('className="login-access-kicker"');
    expect(login).toContain('className="login-remember-native"');
    expect(login).toContain('className="login-btn-spinner"');
    expect(login).not.toContain("tabIndex={-1}");
    expect(login).not.toContain('className="login-feature-visual"');
    expect(login).not.toContain('className="login-feature-stage"');
    expect(login).not.toContain('className="login-operation-line"');

    const estilos = leer("src/styles/login-network.css");
    expect(estilos).toContain("grid-template-columns: minmax(0, 1.55fr) minmax(400px, .82fr)");
    expect(estilos).toMatch(/\.login-left-panel \{[\s\S]*?grid-column: 1;[\s\S]*?grid-row: 1;/);
    expect(estilos).toMatch(/\.login-right-panel \{[\s\S]*?grid-column: 2;[\s\S]*?grid-row: 1;/);
    expect(estilos).toContain("border-left: 1px solid #DDE6F0");
    expect(estilos).toContain("min-height: 100dvh");
    expect(estilos).toContain("max-width: none");
    expect(estilos).toContain("border-radius: 0");
    expect(estilos).toContain("login-network-globe-canvas");
    expect(estilos).toContain(".login-network-message::before");
    expect(estilos).toContain("login-network-live-pulse");
    expect(estilos).not.toContain("login-network-scene-cycle");
    expect(estilos).not.toContain("login-dot-brand-word");
    expect(estilos).not.toContain("login-billboard-code-arrive");
    expect(estilos).not.toContain("login-network-index-three");
    expect(estilos).toContain("prefers-reduced-motion: reduce");
    expect(estilos).not.toContain(".jpg");
    expect(estilos).not.toContain(".png");
    expect(login).not.toContain("login-led-scene");
    expect(login).not.toContain("login-report-visual");

    const sistema = leer("src/styles/design-system.css");
    expect(sistema).toContain(".login-message-stack");
    expect(sistema).toContain("@media (max-width: 899px) and (max-height: 740px)");
  });

  it("anima un planeta pixelado eficiente y libera todos sus recursos", () => {
    const globo = leer("src/components/PixelGlobe.tsx");
    expect(globo).toContain('className="login-network-globe-canvas"');
    expect(globo).toContain('matchMedia("(min-width: 900px)")');
    expect(globo).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
    expect(globo).toContain("window.requestAnimationFrame");
    expect(globo).toContain("window.cancelAnimationFrame");
    expect(globo).toContain("new ResizeObserver");
    expect(globo).toContain("observador.disconnect()");
    expect(globo).toContain('removeEventListener("visibilitychange"');
    expect(globo).toContain("document.hidden");
    expect(globo).toContain("lineDashOffset");
    expect(globo).toContain("lat += 1.8");
    expect(globo).toContain("lon += 1.8");
    expect(globo).toContain("lat += 3");
    expect(globo).toContain("lon += 3");
    expect(globo).toContain("if (esTierra(lon, lat))");
    expect(globo).toContain("if (!esTierra(lon, lat))");
    expect(globo).toContain('const ETIQUETAS = ["Cobertura", "Resultados", "Impacto"]');
    expect(globo).not.toContain("DURACION_ETIQUETA");
    expect(globo).toContain("seleccionados.length === ETIQUETAS.length");
    expect(globo).toContain("etiquetaDisponible");
    expect(globo).toContain("const distanciaBorde");
    expect(globo).toContain("candidato.punto.x + 16");
    expect(globo).toContain("candidato.punto.x");
    expect(globo).toContain("const cosenoAngulo = Math.cos(angulo)");
    expect(globo).toContain("const senoAngulo = Math.sin(angulo)");
    expect(globo).not.toContain("function rotar");
    expect(globo).toContain("ancho * 0.84");
    expect(globo).not.toContain("fetch(");
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
    expect(login).not.toContain("campoEnFoco");
    expect(login).not.toContain("login-keyboard-open");
    expect(login).not.toContain("onFocusCapture");
    expect(login).not.toContain("onPointerDownCapture");
    expect(estilos).toContain(".login-shell:has(#login-email:focus, #login-password:focus)");
    expect(estilos).toContain("touch-action: none");
    expect(estilos).toContain("font-size: 16px");
    expect(estilos).toContain(".login-card #login-email");
    expect(estilos).toContain("font-size: 15px");
    expect(estilos).toContain("top: var(--visual-offset-top, 0px)");
    expect(estilos).toContain("width: var(--visual-width, 100vw)");
    expect(estilos).toContain("height: var(--visual-height, 100dvh)");
    expect(estilos).toContain(".login-shell:has(#login-email:focus, #login-password:focus)::before");
    expect(estilos).toContain("height: var(--app-height, 100vh)");
    expect(viewport).toContain("visualHeight || window.innerHeight || currentHeight");
    expect(viewport).toContain('setProperty("--visual-offset-top"');
    expect(viewport).toContain('addEventListener("scroll", set)');
    expect(login).not.toContain("window.scrollTo(0, 0)");
  });

  it("mantiene el login móvil en orientación vertical", () => {
    const manifest = JSON.parse(leer("public/manifest.json")) as { orientation?: string };
    const main = leer("src/main.tsx");
    const orientacion = leer("src/utils/orientacion-vertical.ts");
    const estilos = leer("src/styles/design-system.css");

    expect(manifest.orientation).toBe("portrait-primary");
    expect(main).toContain("mantenerOrientacionVertical();");
    expect(orientacion).toContain('lock("portrait-primary")');
    expect(orientacion).toContain('addEventListener("orientationchange"');
    expect(orientacion).toContain('addEventListener("pointerdown"');
    expect(estilos).toContain("@media (max-width: 899px)");
    expect(estilos).toContain("font-size: 9px");
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
    expect(estilosApp).toContain(".reports-filter-stack + .report-empty-state");
    expect(estilosApp).toContain(".report-empty-state + .reports-filter-stack");
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

  it("convierte el sidebar de laptop en un carril interactivo compacto", () => {
    const sidebar = leer("src/components/Sidebar.tsx");
    const sistema = leer("src/styles/design-system.css");
    expect(sidebar).toContain('data-active={active || ""}');
    expect(sidebar).toContain('className="sidebar-desktop-context"');
    expect(sidebar).toContain('aria-current={it.id === active ? "page" : undefined}');
    expect(sidebar).toContain('data-tooltip={it.label}');
    expect(sidebar).toContain('role="button"');
    expect(sidebar).toContain('tabIndex={0}');
    expect(sistema).toContain("NAVEGACIÓN COMPACTA INTERACTIVA — SOLO LAPTOP");
    expect(sistema).toContain("--sidebar-rail: 76px");
    expect(sistema).toContain("content: attr(data-tooltip)");
    expect(sistema).toContain(".sidebar-panel .sidebar-item:hover::after");
    expect(sistema).toContain(".sidebar-panel .sidebar-item:focus-visible::after");
    expect(sistema).toMatch(/\.sidebar-panel \.sidebar-item-icon \{[\s\S]*?color: #fff !important;/);
    expect(sistema).toMatch(/\.sidebar-panel \{[\s\S]*?border-radius: 0 21px 21px 0;[\s\S]*?background: #050505;/);
    expect(sistema).toMatch(/\.sidebar-panel \.sidebar-pill \{[\s\S]*?radial-gradient\(circle at 50% 50%/);
    expect(sistema).toMatch(/\.sidebar-panel \.sidebar-item-active \.sidebar-item-icon \{[\s\S]*?background: #f8fafc;/);
    expect(sistema).not.toContain('.sidebar-list[data-active="campanas"]');
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

  it("reduce la saturación visual de la app únicamente en laptop", () => {
    const sistema = leer("src/styles/design-system.css");
    expect(sistema).toContain("ESCRITORIO EDITORIAL — MENOS CAPAS, MÁS JERARQUÍA");
    expect(sistema).toMatch(/@media \(min-width: 900px\) \{[\s\S]*?--desktop-canvas: #f4f6f9;/);
    expect(sistema).toMatch(/\.inicio-account-status \{[\s\S]*?background: #f8fafc;/);
    expect(sistema).toMatch(/\.mis-campanas-month-status \{[\s\S]*?background: var\(--desktop-surface\) !important;/);
    expect(sistema).toMatch(/\.report-action-muted \{[\s\S]*?background: transparent !important;/);
    expect(sistema).toContain("Cobertura conserva el mapa protagonista");
  });
});
