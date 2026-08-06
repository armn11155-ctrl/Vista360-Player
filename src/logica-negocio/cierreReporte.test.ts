import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const codigo = readFileSync(
  resolve(__dirname, "../../functions/src/generarReporteCliente.ts"),
  "utf-8",
);

describe("cierre del reporte", () => {
  it("muestra la web debajo del correo con icono de globo", () => {
    expect(codigo).toContain('const CONTACTO_WEB = "www.vista360player.pe"');
    expect(codigo).toContain("drawWebsiteIcon(doc, rightColX, rTop + 296, 32, iconColor)");
    expect(codigo).toContain(".text(CONTACTO_WEB, rightColX + 46, rTop + 302");
  });

  it("mantiene exactamente 66 pt entre telefono, correo y web", () => {
    const posicionesIconos = [164, 230, 296];
    expect(posicionesIconos[1]! - posicionesIconos[0]!).toBe(66);
    expect(posicionesIconos[2]! - posicionesIconos[1]!).toBe(66);
    for (const y of posicionesIconos) {
      expect(codigo).toContain(`rTop + ${y}, 32, iconColor`);
    }
  });

  it("agranda el rubro del negocio", () => {
    const inicio = codigo.indexOf("// Categoria del negocio mas grande");
    const bloque = codigo.slice(inicio, inicio + 400);
    expect(bloque).toContain('fontSize(18)');
    expect(bloque).toContain("PUBLICIDAD EXTERIOR · PANELES PREMIUM");
  });
});
