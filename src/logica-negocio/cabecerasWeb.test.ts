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
        cspReportOnly,
        "Cambió un bloque <style> en línea. Ejecuta `node scripts/hashes-csp.mjs` y actualiza public/_headers."
      ).toContain(hashCsp(bloque));
    }
  });

  it.each(HTMLS)("los <script> en línea de $archivo están permitidos por hash", ({ ruta }) => {
    for (const bloque of bloquesEnLinea(readFileSync(ruta, "utf8"), "script")) {
      expect(
        cspReportOnly,
        "Cambió un bloque <script> en línea. Ejecuta `node scripts/hashes-csp.mjs` y actualiza public/_headers."
      ).toContain(hashCsp(bloque));
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
  it("existe una política aplicada y otra en Report-Only", () => {
    expect(csp).not.toBe("");
    expect(cspReportOnly).not.toBe("");
  });

  it("la política APLICADA solo trae directivas que no pueden romper la app", () => {
    // Si alguien mueve aquí script-src o connect-src sin haber
    // comprobado Report-Only antes, esto lo frena.
    const permitidas = ["frame-ancestors", "base-uri", "form-action"];
    const presentes = csp.split(";").map((d) => d.trim().split(" ")[0]).filter(Boolean);
    expect(presentes.sort()).toEqual(permitidas.sort());
  });

  it("no se puede embeber la app en otro sitio (clickjacking)", () => {
    expect(directiva(csp, "frame-ancestors")).toBe("'none'");
    expect(headers).toContain("X-Frame-Options: DENY");
  });

  it("base-uri y form-action están acotados a 'self'", () => {
    expect(directiva(csp, "base-uri")).toBe("'self'");
    expect(directiva(csp, "form-action")).toBe("'self'");
  });

  it("NO hay unsafe-eval en ninguna política", () => {
    expect(csp).not.toContain("unsafe-eval");
    expect(cspReportOnly).not.toContain("unsafe-eval");
  });

  it("NO hay unsafe-inline en ninguna política (se usan hashes)", () => {
    expect(csp).not.toContain("unsafe-inline");
    expect(cspReportOnly).not.toContain("unsafe-inline");
  });

  it("script-src no admite comodines: solo 'self' y hashes", () => {
    const valores = directiva(cspReportOnly, "script-src").split(/\s+/).filter(Boolean);
    expect(valores).toContain("'self'");
    for (const v of valores) {
      expect(v === "'self'" || v.startsWith("'sha256-")).toBe(true);
    }
  });

  it("connect-src lista dominios concretos, nunca * ni https: suelto", () => {
    const valores = directiva(cspReportOnly, "connect-src").split(/\s+/).filter(Boolean);
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
    expect(directiva(cspReportOnly, "default-src")).toBe("'self'");
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
    const valores = directiva(cspReportOnly, "connect-src").split(/\s+/).filter(Boolean);
    expect(valores.filter((v) => v.startsWith("https://")).sort()).toEqual(esperados.sort());
  });

  it("el iframe del mapa está acotado a Google Maps, y el mapa sigue usándolo", () => {
    expect(directiva(cspReportOnly, "frame-src")).toBe("https://www.google.com");
    const detalle = readFileSync(join(RAIZ, "src", "components", "screens", "DetalleCampana.tsx"), "utf8");
    expect(detalle).toContain("https://www.google.com/maps?q=");
  });

  it("img-src permite las fuentes reales de imágenes y nada más", () => {
    const valores = directiva(cspReportOnly, "img-src").split(/\s+/).filter(Boolean);
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

  it("object-src permite blob: SOLO por el visor de PDF, y está documentado", () => {
    expect(directiva(cspReportOnly, "object-src")).toBe("blob:");
    expect(headers).toContain("RELAJACION DOCUMENTADA");
    // La razón tiene que seguir siendo cierta: si el visor deja de usar
    // <embed>, hay que volver a object-src 'none'.
    expect(readFileSync(join(RAIZ, "public", "visor-pdf.html"), "utf8")).toContain("<embed");
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
