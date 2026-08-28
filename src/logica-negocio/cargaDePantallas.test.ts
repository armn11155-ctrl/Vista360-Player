import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * LA NAVEGACIÓN NO PUEDE MORIR EN SILENCIO.
 *
 * setView() cambia de pantalla dentro de un startTransition, y React no
 * cambia nada hasta tener el código de la pantalla nueva. Cada pantalla
 * es un .js aparte cuyo nombre cambia con cada despliegue. Si ese código
 * no llega -- una pestaña abierta desde antes del despliegue, una copia
 * envenenada en la caché del Service Worker -- React se queda mostrando
 * la pantalla anterior: sin error, sin aviso, sin nada en la consola.
 *
 * Se pulsa "Campañas" y no pasa absolutamente nada. Pasó de verdad, y
 * costó horas encontrarlo justamente porque no deja rastro.
 */

const raiz = resolve(__dirname, "../..");
const app = readFileSync(resolve(__dirname, "../App.tsx"), "utf-8");
const helper = readFileSync(resolve(__dirname, "../utils/pantallaLazy.ts"), "utf-8");
const main = readFileSync(resolve(__dirname, "../main.tsx"), "utf-8");
const sw = readFileSync(resolve(raiz, "public/sw.js"), "utf-8");
const selectorClientes = readFileSync(resolve(__dirname, "../components/AdminClientPicker.tsx"), "utf-8");
const brandLoader = readFileSync(resolve(__dirname, "../components/BrandLoader.tsx"), "utf-8");
const diseno = readFileSync(resolve(__dirname, "../styles/design-system.css"), "utf-8");
const indexHtml = readFileSync(resolve(raiz, "index.html"), "utf-8");
const manifest = readFileSync(resolve(raiz, "public/manifest.json"), "utf-8");

describe("todas las pantallas se cargan con recuperación", () => {
  it("NINGUNA usa lazy() pelado", () => {
    // Un lazy() sin recuperación es una pantalla que puede volverse
    // inalcanzable para siempre tras un despliegue.
    expect(app).not.toMatch(/[^a-zA-Z]lazy\(\(\) => import\(/);
  });

  it("todas usan pantallaLazy", () => {
    const cuantas = (app.match(/pantallaLazy\(\(\) => import\(/g) ?? []).length;
    expect(cuantas).toBeGreaterThanOrEqual(15);
  });
});

describe("qué hace pantallaLazy cuando la carga falla", () => {
  it("limpia la caché del Service Worker antes de reintentar", () => {
    // Reintentar sin limpiar vuelve a leer la misma copia envenenada.
    // Se mira SOLO el trozo entre el primer fallo y el reintento: la
    // definicion de la funcion tambien contiene ese nombre y colarse ahi
    // haria pasar el test sin que se llamara a nada.
    const desde = helper.indexOf("catch (primerFallo)");
    const hasta = helper.lastIndexOf("return await cargar()");
    expect(desde).toBeGreaterThan(-1);
    expect(hasta).toBeGreaterThan(desde);
    expect(helper.slice(desde, hasta)).toContain("await limpiarCacheDelServiceWorker();");
  });

  it("reintenta UNA vez y luego recarga la página", () => {
    expect((helper.match(/await cargar\(\)/g) ?? []).length).toBe(2);
    expect(helper).toContain("recargarPorVersionDesactualizada()");
  });

  it("espera a que el Service Worker confirme, pero no para siempre", () => {
    expect(helper).toContain("canal.port1.onmessage");
    expect(helper).toMatch(/setTimeout\(resolver, \d+\)/);
  });
});

describe("el guard de recarga no puede dejar la app atascada", () => {
  it("es por TIEMPO, no de una sola vez", () => {
    // Antes era una marca en sessionStorage que no se borraba nunca: si
    // la primera recarga no bastaba, quedaba puesta para toda la sesión
    // y no se reintentaba NUNCA. Así se llega a una app que solo
    // funciona en la pantalla que ya tenía cargada.
    expect(helper).toContain("VENTANA_MS");
    expect(helper).toMatch(/Date\.now\(\) - ultima < VENTANA_MS/);
    expect(helper).not.toMatch(/if \(sessionStorage\.getItem\([A-Z_]+\)\) return;/);
  });

  it("main.tsx usa ese mismo guard, no uno propio", () => {
    expect(main).toContain('from "./utils/pantallaLazy"');
    expect(main).not.toContain("function recargarPorVersionDesactualizada()");
  });

  it("sigue enganchado a los dos eventos que detectan chunks viejos", () => {
    expect(main).toContain('"vite:preloadError"');
    expect(main).toContain('el.tagName !== "SCRIPT" && el.tagName !== "LINK"');
  });
});

describe("el Service Worker confirma cuando terminó de limpiar", () => {
  it("contesta por el puerto que le mandan", () => {
    // Sin respuesta, quien limpia no sabe cuándo terminó y reintenta
    // sobre la caché vieja.
    expect(sw).toContain("event.ports[0].postMessage");
  });

  it("la versión de la caché cambia automáticamente en cada build", () => {
    expect(sw).toContain('const BUILD = "__VISTA360_BUILD__"');
    expect(sw).toContain("v360player-shell-${BUILD}");
    const vite = readFileSync(resolve(__dirname, "../../vite.config.ts"), "utf-8");
    expect(vite).toContain('replace("__VISTA360_BUILD__", buildId)');
  });
});

describe("una pestaña abierta desde antes del despliegue se entera sola", () => {
  it("el Service Worker avisa a las pestañas ya abiertas al activarse", () => {
    // Es lo ÚNICO que alcanza a una pestaña que sigue ejecutando el
    // JavaScript viejo: ese código no puede arreglarse a sí mismo.
    expect(sw).toContain('self.clients.matchAll({ type: "window" })');
    expect(sw).toContain('cliente.postMessage({ tipo: "version-nueva" })');
  });

  it("reclama las pestañas ANTES de avisarles", () => {
    // Sin claim(), el Service Worker nuevo no controla las pestañas
    // viejas y el aviso no sirve de nada.
    const act = sw.slice(sw.indexOf('addEventListener("activate"'));
    expect(act.indexOf("clients.claim()")).toBeLessThan(act.indexOf("postMessage"));
  });

  it("un fallo al avisar a una pestaña no frena a las demás", () => {
    const act = sw.slice(sw.indexOf('addEventListener("activate"'));
    expect(act.slice(0, 1600)).toContain("try {");
  });

  it("la app escucha ese aviso y recarga", () => {
    expect(main).toContain('evento.data?.tipo === "version-nueva"');
    expect(main).toContain("recargarPorVersionDesactualizada()");
  });
});

describe("un cambio de pantalla que no termina se detecta y se recupera", () => {
  it("setView usa useTransition, no el startTransition suelto", () => {
    // Con el suelto no hay forma de saber si el cambio quedó a medias.
    expect(app).toContain("const [cambioEnCurso, comenzarCambioDePantalla] = useTransition()");
    expect(app).toContain("comenzarCambioDePantalla(() => setViewInmediato(v))");
  });

  it("si el cambio tarda demasiado, la app se recarga sola", () => {
    // Es EL modo de fallo que costó todo un día: React se queda
    // mostrando la pantalla anterior sin error, sin aviso y sin nada en
    // la consola. La persona pulsa un botón y no pasa absolutamente
    // nada. Ahora, si no se completa, se recarga.
    expect(app).toContain("if (!cambioEnCurso) return;");
    expect(app).toContain("recargarPorVersionDesactualizada()");
    expect(app).toMatch(/ESPERA_MAXIMA_CAMBIO_MS = \d+/);
  });

  it("el reloj se cancela cuando el cambio SÍ termina", () => {
    // Sin esto recargaría la app cada vez que se navega.
    const bloque = app.slice(app.indexOf("if (!cambioEnCurso) return;"));
    expect(bloque.slice(0, 400)).toContain("clearTimeout(reloj)");
  });

  it("las pestañas y detalles usan React sin desplegar la cortina de contexto", () => {
    // contratoAbierto, adminClienteId y demás cambian en el mismo clic;
    // si fueran por otra vía, React 18 lanza el error #426.
    expect(app).toContain("comenzarCambioDePantalla(() => setContratoAbiertoInmediato(c))");
    expect(app).toContain("comenzarCambioDePantalla(() => setAdminVistaClienteInmediato(v))");
    expect(app).not.toContain("programarCambioDePantalla(() => setViewInmediato(v))");
  });

  it("reserva la cortina para sesión y entrada o salida de una cuenta", () => {
    expect(app).toContain("programarCambioDePantalla(() => setAdminClienteIdInmediato(id))");
    expect(app).toContain("setAuthPresentada(authActual)");
    expect(app).toContain('auth.status === "out" && authActual.status === "in"');
  });

  it("cubre el árbol anterior y abre la vista solo después del commit", () => {
    const movimiento = readFileSync(resolve(raiz, "src/styles/navigation-motion.css"), "utf-8");
    expect(app).toContain('dataset.v360PageTransition = "covering"');
    expect(app).toContain('dataset.v360PageTransition = "revealing"');
    expect(app).toContain("actualizaciones.forEach((cambiar) => cambiar())");
    expect(app).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
    expect(app).toContain("CIERRE_VISUAL_MS = 260");
    expect(app).toContain("PAUSA_VISUAL_MS = 20");
    expect(app).toContain("APERTURA_VISUAL_MS = 300");
    expect(app).toContain("relojPausaVisualRef");
    expect(movimiento).toContain('data-v360-page-transition="covering"');
    expect(movimiento).toContain('data-v360-page-transition="revealing"');
    expect(movimiento).toContain("v360-page-settle");
    expect(movimiento).toContain("v360-transition-atmosphere");
    expect(movimiento).toContain("translate3d(-105%, 0, 0)");
    expect(movimiento).toContain("translate3d(105%, 0, 0)");
    expect(movimiento).not.toContain('url("/icon-192.png")');
    expect(movimiento).not.toContain('url("/logo-player.webp")');
    expect(movimiento).not.toContain("64px 64px");
    expect(movimiento).not.toContain("mix-blend-mode: screen");
    expect(movimiento).not.toContain("linear-gradient(104deg");
    expect(movimiento).not.toContain("at 84% 86%");
    expect(movimiento).not.toContain("at 82% 78%");
    expect(movimiento).toMatch(/\.screen\.active > \* \{[\s\S]*?animation: none !important;/);
  });
});

describe("la carga inicial conserva la cortina hasta que la cuenta está lista", () => {
  it("el selector mantiene la cortina mientras consulta los clientes", () => {
    expect(selectorClientes).toContain('<BrandLoader label="Preparando el selector de clientes" />');
  });

  it("la aplicación espera los contratos y deja pintar la vista antes de retirar la cortina", () => {
    expect(app).toContain('contratosState.status === "loading"');
    expect(app).toContain("requestAnimationFrame(() => {");
    expect(app).toContain('<BrandLoader label="Preparando tu cuenta" leaving={loaderInicialSaliendo} />');
  });

  it("no vuelve a mostrar el logo en ninguna pantalla de espera", () => {
    expect(brandLoader).not.toContain("logo-player.webp");
    expect(indexHtml).not.toMatch(/class="v360-boot"[\s\S]*?<img/);
    expect(brandLoader).toContain("brand-loader-sweep");
    expect(indexHtml).toContain('<meta name="theme-color" content="#071D48" />');
    expect(manifest).toContain('"background_color": "#071D48"');
    expect(app).toMatch(/auth\.status === "loading"[\s\S]*?\? "#071D48"/);
    expect(app).toMatch(/!adminClienteId[\s\S]*?\? "#071D48"/);
  });

  it("el logo del selector se contiene completo en escritorio y celular", () => {
    expect(diseno).toMatch(/\.admin-picker-editorial-brand img \{[\s\S]*?object-fit: contain;[\s\S]*?clip-path: none;/);
    expect(diseno).toMatch(/@media \(max-width: 899px\) \{[\s\S]*?\.admin-picker-editorial-brand img \{[\s\S]*?max-width: 112px;/);
  });

  it("el título no recorta sus signos y se elimina la métrica de cuentas con campaña", () => {
    expect(diseno).toMatch(/\.admin-picker-title \{[\s\S]*?overflow: visible !important;[\s\S]*?line-height: 1\.18 !important;/);
    expect(selectorClientes).not.toContain("cuenta con campaña");
    expect(selectorClientes).not.toContain("cuentas con campaña");
  });
});

describe("sonido de interfaz deliberado", () => {
  const login = readFileSync(resolve(raiz, "src/components/LoginScreen.tsx"), "utf-8");
  const navegacion = readFileSync(resolve(raiz, "src/components/BottomNav.tsx"), "utf-8");
  const sidebar = readFileSync(resolve(raiz, "src/components/Sidebar.tsx"), "utf-8");
  const sonidos = readFileSync(resolve(raiz, "src/utils/sonidosInterfaz.ts"), "utf-8");

  it("suena solo en acceso exitoso, selección de cuenta y cambio de pestaña", () => {
    expect(app).toContain('reproducirSonidoInterfaz("acceso")');
    expect(app).toContain('reproducirSonidoInterfaz("cuenta")');
    expect(navegacion).toContain('reproducirSonidoInterfaz("navegacion")');
    expect(sidebar).toContain('reproducirSonidoInterfaz("navegacion")');
  });

  it("Safari prepara Web Audio durante el gesto y el audio nunca bloquea", () => {
    expect(login).toContain("prepararSonidosInterfaz()");
    expect(sonidos).toContain("webkitAudioContext");
    expect(sonidos).toContain("El audio es una mejora sensorial");
  });
});
