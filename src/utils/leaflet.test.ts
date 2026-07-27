import { describe, expect, it } from "vitest";
import { zoomMinimoSinGris } from "./leaflet";

describe("zoomMinimoSinGris", () => {
  it("nunca deja el mundo mas chico que el lado mas largo del recuadro", () => {
    const casos: Array<[number, number]> = [
      [340, 430], // celular, angosto y alto
      [900, 430], // tarjeta de escritorio, ancha
      [1400, 800], // ventana muy ancha
      [200, 200], // cuadrado
      [1, 1], // extremo chico
      [3000, 3000], // extremo grande
    ];
    for (const [ancho, alto] of casos) {
      const z = zoomMinimoSinGris(ancho, alto);
      const mundo = 256 * 2 ** z;
      expect(mundo).toBeGreaterThanOrEqual(Math.max(ancho, alto));
      // Y que sea el MINIMO tal zoom (un nivel menos ya mostraria gris),
      // salvo que ya estemos en el piso (z=0).
      if (z > 0) {
        const mundoUnMenos = 256 * 2 ** (z - 1);
        expect(mundoUnMenos).toBeLessThan(Math.max(ancho, alto));
      }
    }
  });

  it("usa el lado mas largo, no el mas corto", () => {
    // Un recuadro muy angosto y muy alto deberia dar el mismo resultado
    // que uno muy alto y muy angosto (simetrico) -- lo que importa es el
    // lado mas largo, sea ancho o alto.
    expect(zoomMinimoSinGris(100, 900)).toBe(zoomMinimoSinGris(900, 100));
  });

  it("nunca devuelve un zoom negativo, ni con entradas invalidas", () => {
    expect(zoomMinimoSinGris(0, 0)).toBeGreaterThanOrEqual(0);
    expect(zoomMinimoSinGris(-50, -50)).toBeGreaterThanOrEqual(0);
    expect(zoomMinimoSinGris(NaN, 500)).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(zoomMinimoSinGris(NaN, NaN))).toBe(true);
  });
});
