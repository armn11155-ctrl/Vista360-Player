import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const leer = (ruta: string) => readFileSync(resolve(__dirname, "../..", ruta), "utf-8");

describe("el primer contenido visible no espera arranques fríos", () => {
  for (const archivo of ["firmarUrlsR2.ts", "listarReportesCliente.ts"]) {
    it(`${archivo} mantiene una instancia económica preparada`, () => {
      const codigo = leer(`functions/src/${archivo}`);
      expect(codigo).toContain("minInstances: 1");
      // La CPU fraccionaria deja el coste estimado cerca de US$3/mes por
      // Function, en vez de unos US$8 con la CPU completa predeterminada.
      expect(codigo).toContain('cpu: "gcf_gen1"');
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
  });
});
