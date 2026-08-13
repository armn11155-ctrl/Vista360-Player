import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

/**
 * CSP, HSTS y CORS.
 *
 * La prueba más importante de este archivo es la de los HASHES: la CSP
 * permite los bloques <style>/<script> en línea por su hash exacto, así
 * que si alguien edita uno de esos bloques y no actualiza el header, el
 * navegador deja de aplicarlo y la pantalla se rompe EN PRODUCCIÓN, en
 * silencio. Aquí se recalculan desde los HTML reales y se comparan.
 *
 * El cálculo se repite aquí en vez de importarlo de
 * scripts/hashes-csp.mjs a propósito: `scripts/` está fuera del
 * `include` de tsconfig, y arrastrarlo dentro solo para esto obligaba a
 * inventar declaraciones de tipos para un script de línea de comandos.
 * Son seis líneas y la prueba gana en independencia: si el script y la
 * prueba se desincronizaran, la que manda es esta, porque compara
 * contra el HTML de verdad.
 */

const RAIZ = join(__dirname, "..", "..");
const headers = readFileSync(join(RAIZ, "public", "_headers"), "utf8");

function bloquesEnLinea(html: string, tag: string): string[] {
  // Se quitan los comentarios HTML antes de buscar: un comentario que
  // mencione una etiqueta de estilo/script desplazaba el inicio del
  // bloque y el hash salia mal. Lo cazo una prueba con navegador real.
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  const encontrados: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1].trim() !== "") encontrados.push(m[1]);
  }
  return encontrados;
}

function hashCsp(contenido: string): string {
  return `'sha256-${createHash("sha256").update(contenido, "utf8").digest("base64")}'`;
}

/** El valor de una cabecera concreta dentro del bloque de reglas. */
function cabecera(nombre: string): string {
  const linea = headers.split("\n").find((l) => l.trim().startsWith(`${nombre}:`));
  return linea ? linea.trim().slice(nombre.length + 1).trim() : "";
}

const csp = cabecera("Content-Security-Policy");

/** Ya no debe existir una segunda política en Report-Only: tener las dos
 *  a la vez solo consigue que nadie sepa cuál manda. La fase Report-Only
 *  ya se completó (se recorrió producción con un navegador real, se
 *  corrigieron las violaciones encontradas) y la política estricta pasó
 *  a enforcement. */
const cspReportOnly = cabecera("Content-Security-Policy-Report-Only");

/** Extrae el valor de una directiva de una política. */
function directiva(politica: string, nombre: string): string {
  const parte = politica
    .split(";")
    .map((p) => p.trim())
    .find((p) => p === nombre || p.startsWith(`${nombre} `));
  return parte ? parte.slice(nombre.length).trim() : "";
}

const HTMLS = [
  { archivo: "index.html", ruta: join(RAIZ, "index.html") },
  { archivo: "public/visor-pdf.html", ruta: join(RAIZ, "public", "visor-pdf.html") },
  { archivo: "public/404.html", ruta: join(RAIZ, "public", "404.html") },
];

describe("CSP: los hashes coinciden con el HTML real", () => {
  it.each(HTMLS)("los <style> en línea de $archivo están permitidos por hash", ({ ruta }) => {
    for (const bloque of bloquesEnLinea(readFileSync(ruta, "utf8"), "style")) {
      expect(
        csp,
        "Cambió un bloque <style> en línea. Ejecuta `node scripts/hashes-csp.mjs` y actualiza public/_headers."
      ).toContain(hashCsp(bloque));
    }
  });

  it.each(HTMLS)("los <script> en línea de $archivo están permitidos por hash", ({ ruta }) => {
    for (const bloque of bloquesEnLinea(readFileSync(ruta, "utf8"), "script")) {
      expect(
        csp,
        "Cambió un bloque <script> en línea. Ejecuta `node scripts/hashes-csp.mjs` y actualiza public/_headers."
      ).toContain(hashCsp(bloque));
    }
  });


  it("ningún HTML estático usa atributos style= (los hashes no los cubren)", () => {
    // Esta es la regresión que la fase Report-Only cazó en produccion:
    // index.html tenía style="..." en <html> y <body>, y un hash de CSP
    // NO permite atributos style (solo bloques <style>). Con la política
    // aplicada eso deja la pantalla sin fondo. La única forma de
    // permitirlo sería 'unsafe-hashes'/'unsafe-inline', que es peor que
    // mover el estilo a un bloque <style>.
    for (const { archivo, ruta } of HTMLS) {
      const html = readFileSync(ruta, "utf8");
      // Se ignoran los comentarios: el propio index.html explica en uno
      // por qué no debe haber atributos style.
      const sinComentarios = html.replace(/<!--[\s\S]*?-->/g, "");
      expect(sinComentarios, `${archivo} tiene un atributo style=`).not.toMatch(/<[a-zA-Z][^>]*\sstyle\s*=/);
    }
  });

  it("no hay ningún HTML con bloques en línea que se haya olvidado", () => {
    // Si alguien agrega un HTML estático nuevo con <style> o <script>
    // en línea, tiene que entrar en esta lista (y en la CSP).
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const htmlsPublic = readdirSync(join(RAIZ, "public")).filter((f) => f.endsWith(".html"));
    const cubiertos = HTMLS.map((h) => h.archivo.replace("public/", ""));
    expect(htmlsPublic.sort()).toEqual(cubiertos.filter((c) => c !== "index.html").sort());
  });
});

describe("CSP: la política es de lista blanca, no de comodines", () => {
  it("la política estricta está APLICADA, no en Report-Only", () => {
    expect(csp).not.toBe("");
    // Si alguien vuelve a mandarla a Report-Only "un rato", esto avisa.
    expect(cspReportOnly).toBe("");
  });

  it("la política aplicada trae TODAS las directivas, no solo las inocuas", () => {
    const obligatorias = [
      "default-src", "script-src", "style-src", "img-src", "font-src",
      "connect-src", "frame-src", "worker-src", "manifest-src", "media-src",
      "object-src", "base-uri", "form-action", "frame-ancestors",
    ];
    const presentes = csp.split(";").map((d) => d.trim().split(" ")[0]).filter(Boolean);
    for (const d of obligatorias) expect(presentes).toContain(d);
  });

  it("no se puede embeber la app en otro sitio (clickjacking)", () => {
    expect(directiva(csp, "frame-ancestors")).toBe("'none'");
    expect(headers).toContain("X-Frame-Options: DENY");
  });

  it("base-uri y form-action están acotados a 'self'", () => {
    expect(directiva(csp, "base-uri")).toBe("'self'");
    expect(directiva(csp, "form-action")).toBe("'self'");
  });

  it("NO hay unsafe-eval", () => {
    expect(csp).not.toContain("unsafe-eval");
  });

  it("NO hay unsafe-inline ni unsafe-hashes (se usan hashes de bloque)", () => {
    expect(csp).not.toContain("unsafe-inline");
    // 'unsafe-hashes' fue la tentación al encontrar los atributos
    // style= de index.html. Se arregló moviendo el estilo a un bloque
    // <style>, no abriendo la política. Que no vuelva por la puerta de
    // atrás.
    expect(csp).not.toContain("unsafe-hashes");
  });

  it("script-src no admite comodines: solo 'self' y hashes", () => {
    const valores = directiva(csp, "script-src").split(/\s+/).filter(Boolean);
    expect(valores).toContain("'self'");
    for (const v of valores) {
      expect(v === "'self'" || v.startsWith("'sha256-")).toBe(true);
    }
  });

  it("connect-src lista dominios concretos, nunca * ni https: suelto", () => {
    const valores = directiva(csp, "connect-src").split(/\s+/).filter(Boolean);
    expect(valores.length).toBeGreaterThan(1);
    expect(valores).not.toContain("*");
    expect(valores).not.toContain("https:");
    // Un comodín solo se acepta como subdominio de un dominio concreto
    // (https://*.r2.cloudflarestorage.com), nunca suelto.
    for (const v of valores) {
      if (v.includes("*")) expect(v).toMatch(/^https:\/\/\*\.[a-z0-9.-]+\.[a-z]{2,}$/);
    }
  });

  it("default-src es 'self' (todo lo no declarado queda cerrado)", () => {
    expect(directiva(csp, "default-src")).toBe("'self'");
  });

  it("los orígenes de connect-src son exactamente los que la app usa", () => {
    // Si algún día se agrega un dominio "por si acaso", esta prueba
    // obliga a justificarlo tocándola a mano.
    const esperados = [
      "https://firestore.googleapis.com",
      "https://identitytoolkit.googleapis.com",
      "https://securetoken.googleapis.com",
      "https://firebaseinstallations.googleapis.com",
      "https://fcmregistrations.googleapis.com",
      "https://*.cloudfunctions.net",
      "https://*.r2.cloudflarestorage.com",
    ];
    const valores = directiva(csp, "connect-src").split(/\s+/).filter(Boolean);
    expect(valores.filter((v) => v.startsWith("https://")).sort()).toEqual(esperados.sort());
  });

  it("los iframes quedan acotados al mapa y al PDF privado en memoria", () => {
    expect(directiva(csp, "frame-src")).toBe("blob: https://www.google.com");
    const detalle = readFileSync(join(RAIZ, "src", "components", "screens", "DetalleCampana.tsx"), "utf8");
    expect(detalle).toContain("https://www.google.com/maps?q=");
  });

  it("img-src permite las fuentes reales de imágenes y nada más", () => {
    const valores = directiva(csp, "img-src").split(/\s+/).filter(Boolean);
    expect(valores.sort()).toEqual(
      [
        "'self'",
        "data:",
        "blob:",
        "https://*.r2.cloudflarestorage.com",
        "https://tile.openstreetmap.org",
      ].sort()
    );
  });

  it("object-src vuelve a estar cerrado: el visor ya no incrusta plugins", () => {
    expect(directiva(csp, "object-src")).toBe("'none'");
    expect(readFileSync(join(RAIZ, "public", "visor-pdf.html"), "utf8")).not.toContain("<embed");
    expect(readFileSync(join(RAIZ, "public", "visor-pdf.html"), "utf8")).toContain('<iframe id="visor"');
  });
});

describe("HSTS", () => {
  const hsts = cabecera("Strict-Transport-Security");

  it("está presente con un max-age de al menos un año", () => {
    expect(hsts).toContain("max-age=");
    const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0);
    expect(maxAge).toBeGreaterThanOrEqual(31536000);
  });

  it("NO trae includeSubDomains ni preload sin haberlo verificado", () => {
    // Decisión consciente: hoy solo existen el dominio raíz y www.
    // includeSubDomains dejaría una trampa para el día que alguien
    // levante un subdominio sin HTTPS, y preload es casi irreversible.
    // Plan por fases en docs/CABECERAS-WEB.md.
    expect(hsts).not.toContain("includeSubDomains");
    expect(hsts).not.toContain("preload");
  });
});

describe("CORS", () => {
  const r2 = readFileSync(join(RAIZ, "scripts", "set-r2-cors.mjs"), "utf8");

  it("el bucket R2 ya NO acepta cualquier origen", () => {
    expect(r2).not.toContain('AllowedOrigins: ["*"]');
    expect(r2).toContain("AllowedOrigins: origenesPermitidos");
  });

  it("la lista de orígenes de R2 incluye producción y no trae comodines", () => {
    const bloque = /const origenesPermitidos = \[([\s\S]*?)\];/.exec(r2)?.[1] ?? "";
    expect(bloque).toContain("https://vista360player.pe");
    expect(bloque).toContain("https://www.vista360player.pe");
    expect(bloque).not.toContain('"*"');
  });

  it("la única función onRequest no abre CORS a nadie", () => {
    // Es servidor-a-servidor (cron con secreto). Al no mandar ningún
    // Access-Control-Allow-Origin, ningún navegador puede leer su
    // respuesta desde otro origen.
    const fn = readFileSync(join(RAIZ, "functions", "src", "sincronizarEstadoPaneles.ts"), "utf8");
    expect(fn).not.toContain("Access-Control-Allow-Origin");
    expect(fn).toContain('req.get("x-cron-secret") !== process.env.CRON_SYNC_SECRET');
  });
});

describe("CSP: nada del codigo genera estilos o scripts en linea", () => {
  // Estas dos regresiones las cazo una prueba con navegador real, no la
  // lectura del codigo, y son las que de verdad rompen produccion:
  //
  //  - descargarArchivo.ts abria la pestaña del PDF con document.write y
  //    un bloque <style> dentro. Esa pestaña se abre desde nuestro origen
  //    con window.open(""), asi que HEREDA nuestra CSP: el <style> queda
  //    bloqueado (no se puede hashear algo que se arma en ejecucion) y el
  //    PDF sale sin fondo ni tamaño.
  //  - Cobertura.tsx armaba los popups de Leaflet con style="..." para la
  //    foto y el color del estado. Los hashes de CSP no cubren atributos.
  //
  // Las dos se arreglaron aplicando los estilos por CSSOM. Estas pruebas
  // impiden que vuelvan.
  it("descargarArchivo.ts no escribe bloques <style> en la pestaña del PDF", () => {
    const codigo = readFileSync(join(RAIZ, "src", "utils", "descargarArchivo.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(codigo).not.toContain("<style>");
    // El visor vive en una ruta fija propia y el HTML estático coloca el
    // blob privado dentro del iframe permitido expresamente por la CSP.
    expect(codigo).toContain('const rutaVisor = "/visor-pdf.html"');
    expect(readFileSync(join(RAIZ, "public", "visor-pdf.html"), "utf8")).toContain("visor.src = urlLocal");
  });

  it("los popups del mapa no usan atributos style=", () => {
    const codigo = readFileSync(join(RAIZ, "src", "components", "screens", "Cobertura.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(codigo).not.toMatch(/<[a-z][^>]*\sstyle="/);
    expect(codigo).toContain("export function aplicarEstilosPopup(");
    expect(codigo).toContain("aplicarEstilosPopup(evento?.popup?.getElement?.())");
  });
});

describe("Service Worker: no se mete en las peticiones de otros origenes", () => {
  const sw = readFileSync(join(RAIZ, "public", "sw.js"), "utf8");
  const ejecutable = sw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

  it("la rama de otro origen NO llama a respondWith", () => {
    // Bug real encontrado en produccion: la rama hacia
    // respondWith(fetch(event.request)), que parece un reenvio inocuo y
    // no lo es -- rehace la peticion y los tiles del mapa
    // (tile.openstreetmap.org) fallaban en silencio: mapa en gris, sin
    // errores en consola, naturalWidth 0 y sin entrada en la red.
    // Medido: con Service Worker el tile FALLA, sin el CARGA, y en
    // ambos casos CERO violaciones de CSP (no era la CSP).
    const rama = /if \(!mismoOrigen\) \{([\s\S]*?)\n  \}/.exec(ejecutable)?.[1] ?? "";
    expect(rama).not.toContain("respondWith");
    expect(rama.trim()).toBe("return;");
  });

  it("sigue sin cachear nada de otro origen", () => {
    // La razon original de esa rama sigue en pie: de otro origen no se
    // guarda NUNCA nada (hay URLs firmadas de R2 en juego).
    expect(sw).toContain("REGLA DE ORO");
    expect(ejecutable).toContain("const mismoOrigen = url.origin === self.location.origin");
  });
});
