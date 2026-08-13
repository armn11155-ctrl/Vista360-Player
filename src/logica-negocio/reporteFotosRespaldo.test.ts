import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const codigo = readFileSync(resolve(__dirname, "../components/screens/Reportes.tsx"), "utf8");

describe("generación de reportes con fotos resistente a Safari", () => {
  it("mantiene la subida privada por servidor como camino principal", () => {
    expect(codigo).toContain("subirFotoReporteR2(item.dataUrl)");
    expect(codigo).toContain("Promise.allSettled");
  });

  it("si una subida se corta usa la callable autenticada, no abre R2", () => {
    expect(codigo).toContain("usarRespaldoEnLlamada");
    expect(codigo).toContain("foto.dataUrl");
    expect(codigo).toContain("MAX_RESPALDO_BASE64");
    expect(codigo).not.toContain("crearSubidaR2");
  });

  it("el respaldo conserva un tope menor al límite de la callable", () => {
    expect(codigo).toContain("7 * 1024 * 1024");
    expect(codigo).toContain("if (bytesRespaldo > MAX_RESPALDO_BASE64) throw errorSubida");
  });
});
