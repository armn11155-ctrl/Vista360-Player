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
    expect(estilos).toContain("grid-template-columns: minmax(400px, .82fr) minmax(0, 1.55fr)");
    expect(estilos).toMatch(/\.login-left-panel \{[\s\S]*?grid-column: 2;[\s\S]*?grid-row: 1;/);
    expect(estilos).toMatch(/\.login-right-panel \{[\s\S]*?grid-column: 1;[\s\S]*?grid-row: 1;/);
    expect(estilos).toContain("border-right: 1px solid rgba(147,197,253,.18)");
    expect(estilos).toMatch(/\.login-left-panel \{[\s\S]*?linear-gradient\(145deg, #0A2C66 0%, #0A3B8F 46%, #071D48 100%\);/);
    expect(estilos).toMatch(/\.login-right-panel \{[\s\S]*?linear-gradient\(155deg, #07111F 0%, #030811 58%, #050C18 100%\);/);
    expect(estilos).toMatch(/\.login-network-globe-canvas \{[\s\S]*?filter: drop-shadow\(0 34px 72px rgba\(1,8,24,\.30\)\)/);
    expect(estilos).toMatch(/\.login-access-kicker strong \{[\s\S]*?display: block;[\s\S]*?color: #FFFFFF;/);
    expect(estilos).toContain("background: linear-gradient(180deg, #2B6DE8 0%, #245FD2 100%)");
    expect(estilos).toMatch(/\.login-btn:hover:not\(:disabled\) \{[\s\S]*?transform: translateY\(-1px\);/);
    expect(estilos).toMatch(/\.login-btn:active:not\(:disabled\) \{[\s\S]*?transform: translateY\(0\);/);
    expect(estilos).toMatch(/\.login-foot \{[\s\S]*?color: rgba\(214,225,240,\.68\);/);
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
    expect(estilos).toContain("CIERRE EDITORIAL DEL ACCESO");
    expect(estilos).toMatch(/\.login-access-kicker,[\s\S]*?\.login-network-live \{[\s\S]*?display: none !important;/);
    expect(estilos).toMatch(/\.login-network-copy h1 \{[\s\S]*?font-size: clamp\(46px, 4\.7vw, 68px\);[\s\S]*?text-shadow:/);
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
    expect(globo).toContain("lat += 1.45");
    expect(globo).toContain("lon += 1.45");
    expect(globo).toContain("lat += 2.6");
    expect(globo).toContain("lon += 2.6");
    expect(globo).toContain("if (esTierra(lon, lat))");
    expect(globo).toContain("if (!esTierra(lon, lat))");
    expect(globo).toContain('"Cobertura",');
    expect(globo).toContain('"Ubicaciones",');
    expect(globo).toContain("MAX_ETIQUETAS_VISIBLES = 4");
    expect(globo).not.toContain("DURACION_ETIQUETA");
    expect(globo).toContain("seleccionados.length === MAX_ETIQUETAS_VISIBLES");
    expect(globo).not.toContain("etiquetaDisponible");
    expect(globo).toContain("const distanciaBorde");
    expect(globo).toContain("candidato.punto.x + 16");
    expect(globo).toContain("candidato.punto.x");
    expect(globo).toContain("const cosenoAngulo = Math.cos(angulo)");
    expect(globo).toContain("const senoAngulo = Math.sin(angulo)");
    expect(globo).not.toContain("function rotar");
    expect(globo).toContain("ancho * 0.285");
    expect(globo).toContain("ancho * 0.385");
    expect(globo).toContain("-0.62 + tiempo * 0.000092");
    expect(globo).not.toContain('globalCompositeOperation = "destination-in"');
    expect(globo).not.toContain("const mascaraCircular");
    expect(globo).toContain('strokeStyle = "rgba(206, 227, 255, .24)"');
    expect(globo).not.toContain("fetch(");
  });

  it("separa la cabecera editorial de laptop sin alterar la móvil", () => {
    const inicio = leer("src/components/screens/Inicio.tsx");
    const sistema = leer("src/styles/design-system.css");
    expect(inicio).toContain('className="inicio-desktop-page-title"');
    expect(sistema).toContain("CABECERA DE CONTEXTO — LAPTOP");
    expect(sistema).toMatch(/@media \(min-width: 900px\) \{[\s\S]*?\.client-screen-header-title \{[\s\S]*?text-align: left !important;/);
    expect(sistema).toMatch(/\.client-screen-header \.mobile-sidebar-header-btn \{[\s\S]*?display: none !important;/);
    expect(sistema).toContain(".inicio-desktop-page-title { display: none; }");
    expect(sistema).toMatch(/\.inicio-header > \.inicio-greeting-title,[\s\S]*?display: none !important;/);
  });

  it("recupera el saludo como una bienvenida compacta exclusiva de laptop", () => {
    const inicio = leer("src/components/screens/Inicio.tsx");
    const sistema = leer("src/styles/design-system.css");
    expect(inicio).toContain('className="inicio-desktop-welcome"');
    expect(inicio).toContain("Tus clientes, campañas y resultados en una sola vista.");
    expect(inicio).toContain("Tu presencia publicitaria, clara y bajo control.");
    expect(sistema).toContain(".inicio-desktop-welcome { display: none; }");
    expect(sistema).toMatch(/@media \(min-width: 900px\) \{[\s\S]*?\.inicio-desktop-welcome \{[\s\S]*?display: flex;/);
    expect(sistema).toMatch(/\.inicio-desktop-welcome[\s\S]*?margin-bottom: 22px;[\s\S]*?border-radius: 18px;/);
    expect(sistema).toMatch(/\.inicio-desktop-welcome \{[\s\S]*?color: #ffffff;[\s\S]*?linear-gradient\(135deg, #0b1424 0%, #050910 100%\)/);
    expect(inicio).not.toContain("<span>Para ti</span>");
  });

  it("compacta Inicio y extiende la identidad de red a Gestión sin trabajo continuo", () => {
    const sistema = leer("src/styles/design-system.css");
    expect(sistema).toContain("COMPOSICIÓN EJECUTIVA — INICIO Y GESTIÓN EN LAPTOP");
    expect(sistema).toMatch(/\.inicio-desktop-welcome \{[\s\S]*?min-height: 78px;[\s\S]*?margin-bottom: 14px;/);
    expect(sistema).toMatch(/\.inicio-summary-grid > \.inicio-kpi-card \{[\s\S]*?min-height: 66px/);
    expect(sistema).toContain(".admin-picker-management-screen::before");
    expect(sistema).toContain("mask-image: radial-gradient(circle at 78% 34%");
  });

  it("mantiene el refinamiento de selector, gestión y usuarios validado en Safari", () => {
    const selector = leer("src/components/AdminClientPicker.tsx");
    const sistema = leer("src/styles/design-system.css");
    expect(sistema).toContain("REFINAMIENTO VISUAL VALIDADO EN SAFARI");
    expect(sistema).toMatch(/\.admin-picker-editorial-orbit \{[\s\S]*?width: 176px;[\s\S]*?height: 176px;[\s\S]*?border-radius: 50%;/);
    expect(sistema).toContain("animation: v360-selector-orb-breathe 7s ease-in-out infinite");
    expect(sistema).toMatch(/\.admin-picker-editorial-brand \{[\s\S]*?margin-left: -7px;[\s\S]*?margin-top: 10px;/);
    expect(sistema).toMatch(/\.admin-picker-management-head \{[\s\S]*?padding-right: 174px;/);
    expect(selector).toMatch(/admin-picker-management-head[\s\S]*?admin-picker-management-logo/);
    expect(sistema).toMatch(/\.admin-picker-management-head \.admin-picker-management-logo \{[\s\S]*?position: static !important;[\s\S]*?margin: 10px 90px 0 auto !important;/);
    expect(sistema).toMatch(/\.admin-picker-console \{[\s\S]*?border-color: #000 !important;/);
    expect(sistema).toMatch(/\.admin-picker-logout \{[\s\S]*?border-color: #000 !important;[\s\S]*?color: #ff4d5f !important;/);
    expect(sistema).toMatch(/\.admin-picker-management-screen \.admin-picker-management-grid \{[\s\S]*?border-color: #000 !important;/);
    expect(sistema).toMatch(/\.accesos-screen \.accesos-users-list \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    expect(sistema).toContain("@media (prefers-reduced-motion: reduce)");
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

  it("lleva la consola premium del login de escritorio a móvil sin tocar su formulario", () => {
    const login = leer("src/components/LoginScreen.tsx");
    const estilos = leer("src/styles/design-system.css");
    const estilosLogin = leer("src/styles/login-network.css");

    expect(login).toContain('className="login-right-panel"');
    expect(estilos).toContain("LOGIN MÓVIL — CONSOLA DE ACCESO VISTA360");
    expect(estilos).toMatch(/@media \(max-width: 899px\) \{[\s\S]*?\.login-right-panel \{[\s\S]*?border-radius: 26px;[\s\S]*?linear-gradient\(155deg, rgba\(7,17,31,\.97\)/);
    expect(estilos).toMatch(/\.login-logo \.login-tagline \{[\s\S]*?color: rgba\(191,219,254,\.60\);/);
    expect(estilos).toMatch(/\.login-card \{[\s\S]*?background: transparent;[\s\S]*?backdrop-filter: none;/);
    expect(estilos).toMatch(/\.login-card \.form-input \{[\s\S]*?min-height: 52px;[\s\S]*?background: #f8fafd;/);
    expect(estilosLogin).toContain("background: linear-gradient(180deg, #2B6DE8 0%, #245FD2 100%)");
    expect(estilos).toContain("text-transform: uppercase");
    expect(estilos).toContain(".login-shell:has(#login-email:focus, #login-password:focus) .login-right-panel");
    expect(login).not.toContain("login-mobile-only-form");
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
    expect(sistema).toContain("--sidebar-rail: 72px");
    expect(sistema).toContain("content: attr(data-tooltip)");
    expect(sistema).toContain(".sidebar-panel .sidebar-item:hover::after");
    expect(sistema).toContain(".sidebar-panel .sidebar-item:focus-visible::after");
    expect(sistema).toMatch(/\.sidebar-panel \.sidebar-item-icon \{[\s\S]*?color: #fff !important;/);
    expect(sistema).toMatch(/\.sidebar-panel \{[\s\S]*?margin: 10px 0 10px 10px;[\s\S]*?border-radius: 20px;[\s\S]*?background: #050505;/);
    expect(sistema).toMatch(/\.sidebar-panel \.sidebar-pill \{[\s\S]*?border-radius: 50%;[\s\S]*?conic-gradient[\s\S]*?filter: blur\(5px\) saturate\(1\.12\);/);
    expect(sistema).toMatch(/\.sidebar-panel \.sidebar-item-active \.sidebar-item-icon \{[\s\S]*?color: #fff !important;[\s\S]*?background: transparent;/);
    expect(sistema).toContain(".sidebar-panel .sidebar-item:focus-visible:not(.sidebar-item-active) .sidebar-item-icon");
    expect(sistema).toMatch(/\.sidebar-panel \.sidebar-item-active:focus-visible \.sidebar-item-icon \{[\s\S]*?border-color: transparent;[\s\S]*?box-shadow: none;/);
    expect(sistema).toMatch(/\.sidebar-panel \.sidebar-bottom \.sidebar-item-danger,[\s\S]*?color: rgba\(255,255,255,\.62\) !important;/);
    expect(sistema).not.toContain('.sidebar-list[data-active="campanas"]');
    expect(sistema).toContain(".app-shell:has(> .sidebar-panel)");
    expect(sistema).toContain("background: #e9eef5");
  });

  it("distingue el generador de reportes sin oscurecer sus campos", () => {
    const sistema = leer("src/styles/design-system.css");
    expect(sistema).toContain("details.report-admin-panel > .report-admin-header");
    expect(sistema).toMatch(/details\.report-admin-panel > \.report-admin-header \{[\s\S]*?color: #ffffff !important;[\s\S]*?linear-gradient\(135deg, #0b1526 0%, #050910 100%\)/);
    expect(sistema).toMatch(/details\.report-admin-panel > \.report-admin-content \{[\s\S]*?background: #fbfcfe;/);
  });

  it("reduce la saturación de Inicio agrupando piezas afines en laptop", () => {
    const sistema = leer("src/styles/design-system.css");
    expect(sistema).toContain("ESCRITORIO MINIMAL — MENOS TARJETAS, MÁS PRODUCTO");
    expect(sistema).toMatch(/\.inicio-summary-grid \{[\s\S]*?gap: 0 !important;[\s\S]*?border-radius: 15px;/);
    expect(sistema).toMatch(/\.inicio-summary-grid > \.inicio-kpi-card \{[\s\S]*?border-radius: 0 !important;[\s\S]*?box-shadow: none !important;/);
    expect(sistema).toMatch(/\.inicio-quick-grid \{[\s\S]*?gap: 0 !important;[\s\S]*?background: #fff;/);
    expect(sistema).toMatch(/\.inicio-side-col \.inicio-evidence-card \{[\s\S]*?background: #fff !important;/);
    expect(sistema).toMatch(/\.inicio-account-status \{[\s\S]*?color: #0b1220 !important;[\s\S]*?background: #fff !important;/);
    expect(sistema).toMatch(/\.sidebar-panel \.sidebar-pill \{[\s\S]*?width: 44px !important;[\s\S]*?filter: blur\(4px\) saturate\(1\.08\);/);
  });

  it("unifica navegación, login y gestión con geometría corporativa", () => {
    const sistema = leer("src/styles/design-system.css");
    expect(sistema).toContain("CONSOLA CORPORATIVA — NAVEGACIÓN, LOGIN Y GESTIÓN");
    expect(sistema).toMatch(/\.login-access-kicker::before \{[\s\S]*?content: none !important;/);
    expect(sistema).toMatch(/\.login-card::before \{[\s\S]*?content: none !important;[\s\S]*?display: none !important;/);
    expect(sistema).toMatch(/\.sidebar-panel \.sidebar-pill \{[\s\S]*?border-radius: 14px !important;/);
    expect(sistema).toMatch(/\.sidebar-panel \.sidebar-pill::after \{[\s\S]*?border-radius: 9px !important;/);
    expect(sistema).toMatch(/\.admin-picker-management-grid \{[\s\S]*?gap: 0;[\s\S]*?border-radius: 20px;/);
    expect(sistema).toMatch(/\.admin-picker-management-group \{[\s\S]*?border-right: 1px solid/);
    expect(sistema).toMatch(/\.admin-picker-management-card \{[\s\S]*?border-radius: 0;[\s\S]*?background: transparent;/);
  });

  it("corrige la coherencia final de laptop sin alterar la composición móvil", () => {
    const sidebar = leer("src/components/Sidebar.tsx");
    const sistema = leer("src/styles/design-system.css");
    expect(sistema).toContain("COHERENCIA FINAL DE LAPTOP — ACCESO, NAVEGACIÓN Y CUENTA");
    expect(sistema).toMatch(/\.login-right-panel::after \{[\s\S]*?content: none !important;[\s\S]*?display: none !important;/);
    expect(sistema).toMatch(/\.login-access-kicker::before \{[\s\S]*?content: "" !important;[\s\S]*?width: 27px;/);
    expect(sistema).toMatch(/\.sidebar-panel \.sidebar-pill \{[\s\S]*?margin-top: 3px;/);
    expect(sistema).toMatch(/\.sidebar-panel \.sidebar-bottom \.sidebar-item-danger \.sidebar-item-icon,[\s\S]*?background: #050505 !important;[\s\S]*?opacity: 1;/);
    expect(sidebar).toContain('<span className="sidebar-item-label">Cerrar sesión</span>');
    expect(sistema).toMatch(/\.profile-section:nth-child\(4\) \{[\s\S]*?grid-column: 2;[\s\S]*?grid-row: 3;/);
    expect(sistema).toMatch(/\.inicio-side-col \.inicio-evidence-card \{[\s\S]*?linear-gradient\(145deg, #101e35 0%, #07101e 74%\)/);
    expect(sistema).toMatch(/\.admin-picker-header,[\s\S]*?\.admin-picker-management-grid \{[\s\S]*?linear-gradient\(155deg, rgba\(7,17,31,\.96\)/);
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
    expect(sistema).toMatch(/\.mis-campanas-screen \{[\s\S]*?background: var\(--desktop-canvas\) !important;/);
    expect(sistema).toMatch(/\.report-action-muted \{[\s\S]*?background: #f4f8fe !important;/);
    expect(sistema).toMatch(/\.report-action-whatsapp \{[\s\S]*?background: #f1faf4 !important;/);
    expect(sistema).toMatch(/\.report-action-download \{[\s\S]*?color: #fff !important;[\s\S]*?background: #0b1220 !important;/);
    expect(sistema).toContain("Cobertura conserva el mapa protagonista");
  });
});
