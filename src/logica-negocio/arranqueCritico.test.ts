import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const leer = (ruta: string) => readFileSync(resolve(__dirname, "../..", ruta), "utf-8");

describe("las funciones críticas no mantienen instancias con costo fijo", () => {
  for (const archivo of ["firmarUrlsR2.ts", "listarReportesCliente.ts"]) {
    it(`${archivo} escala a cero cuando no se usa`, () => {
      const codigo = leer(`functions/src/${archivo}`);
      expect(codigo).not.toContain("minInstances");
      expect(codigo).not.toContain('cpu: "gcf_gen1"');
    });
  }
});

describe("la curva móvil de Perfil recorta el fondo oscuro", () => {
  it("conserva el trazo y cubre únicamente el negro que quedaba debajo", () => {
    const perfil = leer("src/components/screens/Perfil.tsx");
    const estilos = leer("src/styles/app.css");
    expect(perfil).toContain('className="profile-top-curve-cutout"');
    expect(perfil).toContain('className="profile-top-curve-base"');
    expect(estilos).toContain(".profile-top-curve-cutout");
    expect(estilos).toContain("fill: #F8FAFC !important");
    expect(estilos).toContain("left: -2px");
    expect(estilos).toContain("right: -2px");
    expect(estilos).toContain("stroke-linecap: round");
  });
});
