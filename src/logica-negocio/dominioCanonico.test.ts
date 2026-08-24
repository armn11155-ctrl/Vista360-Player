import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("index.html", "utf8");
const redireccion = readFileSync("public/canonical-host.js", "utf8");
const headers = readFileSync("public/_headers", "utf8");

describe("dominio canónico de Vista360", () => {
  it("redirige los dominios técnicos de Cloudflare al dominio oficial", () => {
    expect(redireccion).toContain('"vista360-player.pages.dev"');
    expect(redireccion).toContain('"vista360.pages.dev"');
    expect(redireccion).toContain('destino.hostname = "vista360player.pe"');
    expect(redireccion).toContain("window.location.replace");
  });

  it("redirige antes de arrancar la aplicación", () => {
    const canonico = html.indexOf('src="/canonical-host.js"');
    const aplicacion = html.indexOf('src="/src/main.tsx"');
    expect(canonico).toBeGreaterThan(-1);
    expect(aplicacion).toBeGreaterThan(canonico);
    expect(html).toContain('<link rel="canonical" href="https://vista360player.pe/"');
  });

  it("no conserva una redirección antigua en caché", () => {
    const bloque = /\/canonical-host\.js[\s\S]*?(?=\n\/|$)/.exec(headers)?.[0] ?? "";
    expect(bloque).toContain("max-age=0");
    expect(bloque).toContain("must-revalidate");
  });
});
