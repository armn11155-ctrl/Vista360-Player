import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const leer = (ruta: string) => readFileSync(resolve(__dirname, "../..", ruta), "utf8");

describe("ajustes visuales solicitados", () => {
  it("Facturas no vuelve a mostrar el resumen de documentos/estados", () => {
    const pantalla = leer("src/components/screens/Facturas.tsx");
    const estilos = leer("src/styles/app.css");
    expect(pantalla).not.toContain("facturas-summary");
    expect(pantalla).not.toContain("<span>Documentos</span>");
    expect(pantalla).not.toContain("<span>Pendientes</span>");
    expect(pantalla).not.toContain("<span>Pagadas</span>");
    expect(estilos).not.toContain(".facturas-summary");
  });

  it("el selector reserva una franja entre sus controles y la tarjeta", () => {
    const estilos = leer("src/styles/design-system.css");
    expect(estilos).toMatch(/@media \(min-width: 900px\)[\s\S]*?\.admin-picker-header\s*{[\s\S]*?margin-top:\s*80px/);
  });
});
