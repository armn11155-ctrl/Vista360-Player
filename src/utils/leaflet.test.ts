import { describe, expect, it } from "vitest";
import { agruparPorCercania, offsetsCirculares, zoomMinimoSinGris } from "./leaflet";

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

describe("agruparPorCercania", () => {
  it("agrupa dos puntos con coordenadas EXACTAMENTE iguales (caso Lima)", () => {
    const puntos = [
      { id: "a", x: 100, y: 100 },
      { id: "b", x: 100, y: 100 },
    ];
    const grupos = agruparPorCercania(puntos, 40);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toHaveLength(2);
  });

  it("agrupa dos puntos CERCANOS pero no identicos (caso Guadalupe: a pocos metros reales, pero pegados en pantalla)", () => {
    const puntos = [
      { id: "a", x: 100, y: 100 },
      { id: "b", x: 112, y: 108 }, // ~14px de distancia, distinto pero "pegado"
    ];
    const grupos = agruparPorCercania(puntos, 40);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toHaveLength(2);
  });

  it("NO agrupa puntos lejos entre si", () => {
    const puntos = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 500, y: 500 },
    ];
    const grupos = agruparPorCercania(puntos, 40);
    expect(grupos).toHaveLength(2);
    expect(grupos.every((g) => g.length === 1)).toBe(true);
  });

  it("encadena grupos de mas de 2 (A cerca de B, B cerca de C, A lejos de C)", () => {
    const puntos = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 30, y: 0 },
      { id: "c", x: 60, y: 0 },
    ];
    // A-B a 30px, B-C a 30px (ambos <= umbral), pero A-C a 60px (> umbral)
    const grupos = agruparPorCercania(puntos, 40);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].map((p) => p.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("no deja ningun punto sin grupo, y no repite ninguno", () => {
    const puntos = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 5, y: 5 },
      { id: "c", x: 900, y: 900 },
      { id: "d", x: 905, y: 895 },
      { id: "e", x: 2000, y: 2000 },
    ];
    const grupos = agruparPorCercania(puntos, 40);
    const idsVistos = grupos.flat().map((p) => p.id).sort();
    expect(idsVistos).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("offsetsCirculares", () => {
  it("separa 2 puntos a 2*radio de distancia entre si (en lados opuestos)", () => {
    const [o1, o2] = offsetsCirculares(2, 26);
    const dist = Math.sqrt((o1.dx - o2.dx) ** 2 + (o1.dy - o2.dy) ** 2);
    expect(dist).toBeCloseTo(52, 5);
  });

  it("cada offset queda exactamente a radioPx del centro", () => {
    const radio = 26;
    for (const n of [2, 3, 4, 5]) {
      offsetsCirculares(n, radio).forEach((o) => {
        expect(Math.sqrt(o.dx ** 2 + o.dy ** 2)).toBeCloseTo(radio, 5);
      });
    }
  });

  it("devuelve exactamente un offset para n=1 (aunque en la práctica ese caso ni se llama -- un grupo de 1 vuelve a su coordenada real sin pasar por acá)", () => {
    const offsets = offsetsCirculares(1, 26);
    expect(offsets).toHaveLength(1);
    expect(Math.sqrt(offsets[0].dx ** 2 + offsets[0].dy ** 2)).toBeCloseTo(26, 5);
  });
});

describe("offsetsCirculares con anguloInicialRad", () => {
  it("sin angulo inicial, empieza hacia la derecha (comportamiento de siempre)", () => {
    const [o] = offsetsCirculares(4, 10);
    expect(o.dx).toBeCloseTo(10, 5);
    expect(o.dy).toBeCloseTo(0, 5);
  });

  it("gira el circulo entero segun el angulo inicial (ej. arriba-derecha a -45°)", () => {
    const [o] = offsetsCirculares(2, 10, -Math.PI / 4);
    expect(o.dx).toBeCloseTo(10 * Math.SQRT1_2, 5); // derecha
    expect(o.dy).toBeCloseTo(-10 * Math.SQRT1_2, 5); // arriba (y negativo en pixeles)
  });

  it("el angulo inicial no cambia la distancia entre puntos, solo la rota", () => {
    const radio = 9;
    const sinGirar = offsetsCirculares(2, radio);
    const girado = offsetsCirculares(2, radio, -Math.PI / 4);
    const distSinGirar = Math.hypot(sinGirar[0].dx - sinGirar[1].dx, sinGirar[0].dy - sinGirar[1].dy);
    const distGirado = Math.hypot(girado[0].dx - girado[1].dx, girado[0].dy - girado[1].dy);
    expect(distGirado).toBeCloseTo(distSinGirar, 5);
  });
});
