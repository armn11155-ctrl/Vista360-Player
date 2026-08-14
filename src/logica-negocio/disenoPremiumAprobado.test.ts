import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const leer = (ruta: string) => readFileSync(resolve(__dirname, "../..", ruta), "utf8");

describe("refinamiento premium aprobado", () => {
  it("conserva avatares nítidos y compacta el selector sin achicar la foto", () => {
    const imagenes = leer("src/utils/comprimirImagen.ts");
    const estilos = leer("src/styles/app.css");

    expect(imagenes).toContain("const AVATAR_SIZE = 512");
    expect(imagenes).toContain("const AVATAR_WEBP_QUALITY = 0.88");
    expect(imagenes).toContain('codificar(canvas, "image/jpeg", 0.92)');
    expect(imagenes).toContain('ctx.imageSmoothingQuality = "high"');
    expect(estilos).toContain("PERFILES NÍTIDOS Y COMPACTOS");
    expect(estilos).toMatch(/\.admin-picker-tile \{[\s\S]*?gap: 6px;[\s\S]*?padding: 8px 8px 9px;/);
    expect(estilos).toMatch(/\.admin-picker-tile-avatar \{[\s\S]*?width: 100%;[\s\S]*?margin: 0;/);
    expect(estilos).toMatch(/\.admin-picker-tile-avatar img \{[\s\S]*?object-fit: cover;[\s\S]*?filter: none;[\s\S]*?transform: none;/);
    expect(estilos).toContain("repeat(auto-fit, minmax(128px, 144px))");
  });

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
    expect(estilos).toMatch(/\.login-network-kicker,[\s\S]*?\.login-network-live \{[\s\S]*?display: none !important;/);
    expect(estilos).toMatch(/\.login-right-panel \.login-logo \{[\s\S]*?position: static;[\s\S]*?max-width: 340px;[\s\S]*?margin: 0 auto 30px;[\s\S]*?text-align: center;[\s\S]*?transform: translateY\(-10px\);/);
    expect(estilos).toMatch(/\.login-network-copy h1 \{[\s\S]*?font-size: clamp\(52px, 5\.2vw, 60px\);[\s\S]*?text-shadow:/);
    expect(estilos).toMatch(/\.login-network-message > p \{[\s\S]*?display: block;[\s\S]*?max-width: 430px;/);
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
    const cartografia = leer("src/data/naturalEarthGlobe.ts");
    expect(globo).toContain('className="login-network-globe-canvas"');
    expect(globo).toContain('from "../data/naturalEarthGlobe"');
    expect(globo).toContain("MASCARA_FRONTERAS_GLOBO");
    expect(globo).not.toContain("const CONTINENTES");
    expect(globo).toContain("let radio = Math.min(ancho * 0.39, alto * 0.31)");
    expect(globo).toContain("let centroX = ancho * 0.506");
    expect(globo).toContain("let centroY = alto * 0.654");
    expect(globo).toContain("radio = Math.min(ancho * 0.235, alto * 0.36)");
    expect(globo).toContain("centroX = ancho * 0.752");
    expect(globo).toContain("centroY = alto * 0.5");
    expect(globo).toContain("const salto = esMovil ? 2 : 1");
    expect(globo).toContain("const intervalo = escritorio.matches ? INTERVALO_CUADRO : 1000 / 24");
    expect(globo).toContain('matchMedia("(min-width: 900px)")');
    expect(globo).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
    expect(globo).toContain("window.requestAnimationFrame");
    expect(globo).toContain("window.cancelAnimationFrame");
    expect(globo).toContain("new ResizeObserver");
    expect(globo).toContain("observador.disconnect()");
    expect(globo).toContain('removeEventListener("visibilitychange"');
    expect(globo).toContain("document.hidden");
    expect(globo).toContain("lineDashOffset");
    expect(cartografia).toContain("Natural Earth 1:110m");
    expect(cartografia).toContain("PASO_GLOBO = 1.1");
    expect(globo).toContain("fila < FILAS_GLOBO");
    expect(globo).toContain("columna < COLUMNAS_GLOBO");
    expect(globo).toContain("lat += 2.45");
    expect(globo).toContain("lon += 2.45");
    expect(globo).toContain("if (bitActivo(MASCARA_TIERRA, indice))");
    expect(globo).toContain("if (!esTierraEnMascara(lon, lat))");
    expect(globo).toContain("PUNTOS_FRONTERA");
    expect(globo).toContain("PUNTOS_TIERRA");
    expect(globo).toContain("PUNTOS_OCEANO");
    expect(globo).toContain("const capasTierra = [new Path2D(), new Path2D(), new Path2D()]");
    expect(globo).toContain("const capaDestellos = new Path2D()");
    expect(globo).toContain("sin aplicar sombras a toda la");
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
    expect(globo).toContain("ancho * 0.506");
    expect(globo).toContain("ancho * 0.39");
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
    const estilosApp = leer("src/styles/app.css");
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
    expect(sistema).toMatch(/\.screen\.active > \*,\s*\.admin-picker-shell \{[\s\S]*?var\(--v360-motion-base\)/);
    expect(estilosApp).toMatch(/\.screens \{ flex: 1; overflow: hidden; position: relative; \}/);
    expect(estilosApp).toMatch(/\.admin-picker-modal-backdrop \{[\s\S]*?animation: dialogo-entrada-fondo var\(--v360-motion-fast/);
    expect(estilosApp).toMatch(/\.admin-picker-modal \{[\s\S]*?animation: dialogo-entrada var\(--v360-motion-base/);
    expect(selector).toContain('aria-haspopup="dialog"');
    expect(selector).toContain('role="dialog"');
    expect(selector).toContain('aria-modal="true"');
    expect(selector).toContain('if (event.key === "Escape") setMenuCliente(null)');
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
    const estilosLogin = leer("src/styles/login-network.css");
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
    expect(estilosLogin).toContain("FOCO MÓVIL — TECLADO SIN DEFORMAR LA IDENTIDAD");
    expect(estilosLogin).toMatch(/html\[data-keyboard-open="true"\][\s\S]*?\.login-left-panel \{[\s\S]*?min-height: 104px;[\s\S]*?flex-basis: 104px;/);
    expect(estilosLogin).toMatch(/html\[data-keyboard-open="true"\][\s\S]*?\.login-network-logo \{[\s\S]*?width: 112px;[\s\S]*?margin: 0;/);
    expect(estilosLogin).toMatch(/html\[data-keyboard-open="true"\][\s\S]*?\.login-network-message \{[\s\S]*?display: none !important;/);
    expect(estilosLogin).toMatch(/html\[data-keyboard-open="true"\][\s\S]*?\.login-right-panel \{[\s\S]*?margin-top: -10px;[\s\S]*?padding: 12px 20px 10px;/);
    expect(estilosLogin).toMatch(/@media \(max-width: 899px\) and \(max-height: 430px\) \{[\s\S]*?min-height: 92px;[\s\S]*?flex-basis: 92px;/);
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

  it("adapta a móvil el mismo lenguaje azul de Login, selector y Centro de gestión", () => {
    const estilos = leer("src/styles/design-system.css");
    const estilosLogin = leer("src/styles/login-network.css");

    expect(estilosLogin).toContain("ACCESO MÓVIL — MISMA RED AZUL DE LAPTOP");
    expect(estilosLogin).toMatch(/@media \(max-width: 899px\) \{[\s\S]*?\.login-left-panel \{[\s\S]*?display: block;[\s\S]*?flex: 0 0 238px;/);
    expect(estilosLogin).toMatch(/\.login-right-panel \{[\s\S]*?margin: -24px auto 0;[\s\S]*?border-radius: 26px 26px 0 0;/);
    expect(estilosLogin).toContain(".login-network-globe-canvas");
    expect(estilos).toContain("PORTAL DE GESTIÓN MÓVIL — CONTINUIDAD CON LAPTOP");
    expect(estilos).toMatch(/\.admin-picker-stage \{[\s\S]*?display: flex;[\s\S]*?flex-direction: column;/);
    expect(estilos).toMatch(/\.admin-picker-top-left-actions,[\s\S]*?\.admin-picker-perfil-btn \{[\s\S]*?z-index: 20;/);
    expect(estilos).toContain(".admin-picker-stage { z-index: 1; }");
    expect(estilos).toContain("PARIDAD PREMIUM MÓVIL — INICIO, GESTIÓN Y MÓDULOS OPERATIVOS");
    expect(estilos).toMatch(/\.admin-picker-editorial \{[\s\S]*?min-height: 76px;[\s\S]*?flex: 0 0 76px;[\s\S]*?background: transparent;/);
    expect(estilos).toMatch(/\.admin-picker-console \{[\s\S]*?border-radius: 23px;[\s\S]*?linear-gradient\(155deg/);
    expect(estilos).toMatch(/\.admin-picker-management-grid \{[\s\S]*?grid-template-columns: 1fr;[\s\S]*?border-radius: 23px;/);
    expect(estilos).toMatch(/\.admin-picker-management-group \{[\s\S]*?border-bottom: 1px solid rgba\(191,219,254,\.10\)/);
    expect(estilosLogin).toContain("PULIDA MÓVIL — PROMESA CLARA Y ACCESO MÁS ESBELTO");
    expect(estilosLogin).toMatch(/\.login-network-message > p,[\s\S]*?\.login-network-live \{[\s\S]*?display: none !important;/);
    expect(estilosLogin).toMatch(/\.login-left-panel,[\s\S]*?min-height: 300px;[\s\S]*?flex-basis: 300px;/);
    expect(estilosLogin).toMatch(/radial-gradient\(circle at 76% 62%, rgba\(0,96,225,\.24\)[\s\S]*?linear-gradient\(112deg, #01306f 0%, #01265d 48%, #011f4b 100%\)/);
    expect(estilosLogin).toMatch(/\.login-left-panel::before \{[\s\S]*?content: none !important;[\s\S]*?display: none !important;/);
    expect(estilosLogin).toMatch(/\.login-network-copy::after \{[\s\S]*?content: none !important;[\s\S]*?display: none !important;/);
    expect(estilosLogin).toMatch(/\.login-network-copy \{[\s\S]*?top: env\(safe-area-inset-top\);[\s\S]*?bottom: 0;[\s\S]*?justify-content: center;[\s\S]*?transform: translateY\(-4px\);/);
    expect(estilosLogin).toMatch(/\.login-network-logo \{[\s\S]*?display: block !important;[\s\S]*?width: 132px;[\s\S]*?margin: 0 0 15px;/);
    expect(estilosLogin).toMatch(/\.login-network-visual-globe \{[\s\S]*?top: env\(safe-area-inset-top\);[\s\S]*?bottom: 0;[\s\S]*?height: auto;[\s\S]*?transform: translateY\(-4px\);/);
    expect(estilosLogin).toMatch(/\.login-right-panel \.login-logo,[\s\S]*?\.login-logo \{[\s\S]*?display: none !important;/);
    expect(estilosLogin).toMatch(/\.login-card,[\s\S]*?\.login-foot,[\s\S]*?width: min\(100%, 288px\);/);
    expect(estilosLogin).toMatch(/\.login-right-panel,[\s\S]*?padding-top: 28px;/);
    expect(estilosLogin).toMatch(/@media \(max-width: 899px\) and \(max-height: 740px\) \{[\s\S]*?min-height: 186px;[\s\S]*?flex-basis: 186px;/);
    expect(estilosLogin).toMatch(/html:not\(\[data-keyboard-open="true"\]\)[\s\S]*?\.login-title \{[\s\S]*?font-size: 28px;/);
    expect(estilosLogin).toMatch(/html:not\(\[data-keyboard-open="true"\]\)[\s\S]*?\.login-access-kicker \{[\s\S]*?min-height: 17px;/);
    expect(estilosLogin).toMatch(/\.login-access-kicker::before \{[\s\S]*?width: 22px;[\s\S]*?height: 1\.5px;[\s\S]*?linear-gradient\(90deg, #2563eb, #60a5fa\)/);
    expect(leer("src/components/PixelGlobe.tsx")).toMatch(/if \(esMovil\) \{[\s\S]*?ancho \* 0\.235[\s\S]*?alto \* 0\.36[\s\S]*?ancho \* 0\.752[\s\S]*?alto \* 0\.5/);
    expect(leer("src/components/PixelGlobe.tsx")).toMatch(/if \(!esMovil\) \{[\s\S]*?contexto\.ellipse\(0, 0, radio \* 1\.24/);
    expect(estilos).toContain("SELECTOR MÓVIL — PERFILES MÁS FINOS Y CENTRADOS");
    expect(estilos).toMatch(/\.admin-picker-grid \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 140px\)\);[\s\S]*?justify-content: center;/);
    expect(estilos).toMatch(/\.admin-picker-grid > \.admin-picker-tile:last-child:nth-child\(odd\) \{[\s\S]*?grid-column: 1 \/ -1;[\s\S]*?justify-self: center;/);
  });

  it("iguala en móvil las superficies premium de Usuarios, Campañas e Inventario", () => {
    const estilos = leer("src/styles/design-system.css");
    const estilosLogin = leer("src/styles/login-network.css");

    expect(estilos).toMatch(/@media \(max-width: 899px\) \{[\s\S]*?\.accesos-screen \.accesos-internal-card \{[\s\S]*?linear-gradient\(135deg, #111f37, #07101e/);
    expect(estilos).toMatch(/\.accesos-screen \.accesos-person-grid \{[\s\S]*?grid-auto-flow: column;[\s\S]*?overflow-x: auto;/);
    expect(estilos).toMatch(/\.accesos-screen \.accesos-users-list \{[\s\S]*?border-radius: 21px;[\s\S]*?background: rgba\(255,255,255,\.78\);/);
    expect(estilos).toMatch(/\.mis-campanas-month-status \{[\s\S]*?background: #fff !important;/);
    expect(estilos).toContain(".mis-campanas-month-status-header img { display: none !important; }");
    expect(estilos).toMatch(/\.paneles-hero \{[\s\S]*?grid-template-columns: 44px minmax\(0, 1fr\);/);
    expect(estilos).toMatch(/\.ocupacion-screen \.occupancy-hero \{[\s\S]*?border-radius: 21px !important;/);
    expect(estilos).toMatch(/\.inicio-header \{[\s\S]*?min-height: 174px;[\s\S]*?repeating-linear-gradient/);
    expect(estilos).toMatch(/\.inicio-header::after \{[\s\S]*?border: 0;[\s\S]*?box-shadow: none;/);
    expect(estilos).toContain("ESCENA NOCTURNA COMPARTIDA — NAVEGACIÓN Y CABECERAS");
    expect(estilos).toMatch(/:is\([\s\S]*?\.client-screen-header,[\s\S]*?\.reports-header,[\s\S]*?\.coverage-header-compact,[\s\S]*?\.campanas-header,[\s\S]*?\.profile-top[\s\S]*?radial-gradient\(circle at 84% 2%/);
    expect(estilos).toMatch(/@media \(max-width: 899px\) \{[\s\S]*?\.sidebar-panel \{[\s\S]*?background: #050505 !important;/);
    expect(estilosLogin).toContain("Autoridad final del login móvil");
    expect(estilosLogin).toMatch(/\.login-left-panel \{[\s\S]*?min-height: 310px;[\s\S]*?flex-basis: 310px;/);
  });

  it("cierra la experiencia móvil sin destellos ni controles escondidos", () => {
    const app = leer("src/App.tsx");
    const perfil = leer("src/components/screens/Perfil.tsx");
    const inicio = leer("src/components/screens/Inicio.tsx");
    const campanas = leer("src/components/screens/MisCampanas.tsx");
    const sistema = leer("src/styles/design-system.css");
    const estilosLogin = leer("src/styles/login-network.css");

    expect(app).toContain("const pageBackground = themeColor;");
    expect(perfil).toContain("{!esInterno && <ProfileRow icon=\"lock\" label=\"Cambiar contraseña\"");
    expect(perfil).toMatch(/\{!esInterno && \([\s\S]*?<ProfileSection title="Seguridad" className="profile-section-security">/);
    expect(inicio).toContain("inicio-kpi-card-report");
    expect(campanas).toContain("campaign-config-button");
    expect(campanas).toContain("Configurar</span>");
    expect(campanas).toContain('role="menuitem"');
    expect(leer("src/components/screens/DetalleCampana.tsx")).toContain('aria-label="Opciones de campaña"');
    expect(leer("src/components/screens/DetalleCampana.tsx")).toContain('cloudFunctions, "actualizarContrato"');
    expect(leer("src/components/screens/DetalleCampana.tsx")).toContain('cloudFunctions, "eliminarContrato"');
    expect(sistema).toContain("CIERRE MÓVIL OPERATIVO — MÁS INFORMACIÓN, MENOS DESPLAZAMIENTO");
    expect(sistema).toContain(".app-shell.has-bottom-nav .screens:has(.inicio-screen)");
    expect(sistema).toMatch(/\.screen\.active > \* \{[\s\S]*?animation: none !important;[\s\S]*?opacity: 1 !important;/);
    expect(sistema).toMatch(/\.inicio-account-status \{ display: none !important; \}/);
    expect(sistema).toMatch(/\.inicio-kpi-card-report \.inicio-kpi-value,[\s\S]*?white-space: normal !important;/);
    expect(sistema).toMatch(/\.inicio-side-col \.inicio-report-body \{[\s\S]*?grid-template-areas:[\s\S]*?"month action"[\s\S]*?"meta action"/);
    expect(sistema).toMatch(/\.inicio-side-col \.inicio-report-month \{[\s\S]*?font-size: 18px !important;/);
    expect(sistema).toMatch(/\.inicio-side-col \.inicio-report-link \{[\s\S]*?background: rgba\(121,182,255,\.10\) !important;/);
    expect(sistema).toMatch(/@media \(max-width: 899px\) and \(max-height: 740px\) \{[\s\S]*?\.inicio-side-col \.inicio-evidence-card \{[\s\S]*?min-height: 98px !important;/);
    expect(sistema).toMatch(/\.campaign-config-button \{[\s\S]*?font-size: 10\.5px;/);
    expect(estilosLogin).toMatch(/\.login-right-panel \{[\s\S]*?width: 100%;[\s\S]*?border-radius: 28px 28px 0 0;/);
    expect(estilosLogin).toContain('html[data-keyboard-open="true"] .login-shell:has(#login-email:focus, #login-password:focus)');
    expect(estilosLogin).toContain('html:not([data-keyboard-open="true"]) .login-shell:has(#login-email:focus, #login-password:focus)');
    expect(leer("src/utils/viewport-height.ts")).toContain('document.documentElement.dataset.keyboardOpen = "true"');
  });

  it("mantiene estable y negro el perfil de laptop", () => {
    const perfil = leer("src/components/screens/Perfil.tsx");
    const sistema = leer("src/styles/design-system.css");

    expect(perfil).toContain('className="profile-section-company"');
    expect(perfil).toContain('label="Nombre de la empresa" value={empresa}');
    expect(perfil).toContain('className="profile-section-summary"');
    expect(perfil).toContain('className="profile-section-account"');
    expect(sistema).toMatch(/@media \(min-width: 900px\) \{[\s\S]*?\.sidebar-panel \{[\s\S]*?background: #050505 !important;/);
    expect(sistema).toMatch(/\.profile-content > \.profile-section-company \{[\s\S]*?grid-row: 1;/);
    expect(sistema).toMatch(/\.profile-content > \.profile-section-summary \{[\s\S]*?grid-row: 1;/);
    expect(sistema).toMatch(/\.profile-section-company > h2,[\s\S]*?\.profile-section-summary > h2 \{[\s\S]*?color: #080b11 !important;/);
    expect(sistema).toMatch(/@media \(max-width: 899px\) \{[\s\S]*?\.profile-company-name-desktop \{ display: none; \}/);
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

  it("permite desplazar Inicio interno y mantiene estable Inicio cliente en móvil", () => {
    const inicio = leer("src/components/screens/Inicio.tsx");
    const sistema = leer("src/styles/design-system.css");

    expect(inicio).toContain('className={`inicio-screen ${isAdmin ? "inicio-screen-admin" : "inicio-screen-client"}`}');
    expect(sistema).toContain("DESPLAZAMIENTO DE INICIO SEGÚN ROL");
    expect(sistema).toMatch(/\.inicio-screen-admin \.inicio-content \{[\s\S]*?overflow-y: auto !important;[\s\S]*?overscroll-behavior-y: contain !important;[\s\S]*?touch-action: pan-y;/);
    expect(sistema).toMatch(/\.inicio-screen-client,[\s\S]*?\.inicio-screen-client \.inicio-content \{[\s\S]*?overflow: hidden !important;[\s\S]*?touch-action: pan-x pinch-zoom;/);
  });

  it("da jerarquía al resumen y evita colisiones en el reporte y el teclado móvil", () => {
    const inicio = leer("src/components/screens/Inicio.tsx");
    const sistema = leer("src/styles/design-system.css");
    const login = leer("src/styles/login-network.css");

    expect(inicio).toContain("inicio-kpi-card-${item.tone}");
    expect(sistema).toContain("PULIDA DE INICIO — RESUMEN CON JERARQUÍA Y REPORTE SIN COLISIONES");
    expect(sistema).toMatch(/\.inicio-side-col \.inicio-report-body \{[\s\S]*?"month action"[\s\S]*?"meta meta";/);
    expect(sistema).toMatch(/\.inicio-screen-client \.inicio-content \{[\s\S]*?padding-top: 12px !important;/);
    expect(login).toContain("TECLADO MÓVIL — COMPOSICIÓN COMPACTA SIN FRANJA NI BOTÓN PEGADO");
    expect(login).toMatch(/data-keyboard-open="true"[\s\S]*?\.login-left-panel \{[\s\S]*?min-height: 88px;[\s\S]*?flex-basis: 88px;/);
    expect(login).toMatch(/data-keyboard-open="true"[\s\S]*?\.login-btn \{[\s\S]*?min-height: 44px;[\s\S]*?margin-top: 1px;/);
  });
});
