import { useEffect, useRef } from "react";
import {
  COLUMNAS_GLOBO,
  FILAS_GLOBO,
  LATITUD_MINIMA_GLOBO,
  MASCARA_FRONTERAS_GLOBO,
  MASCARA_TIERRA_GLOBO,
  PASO_GLOBO,
} from "../data/naturalEarthGlobe";

type PuntoGeografico = { lat: number; lon: number };
type Vector3 = { x: number; y: number; z: number };
type PuntoEsfera = { vector: Vector3; destacado: boolean };

const NODOS: PuntoGeografico[] = [
  { lat: -12.05, lon: -77.04 },
  { lat: 40.71, lon: -74.01 },
  { lat: 40.42, lon: -3.7 },
  { lat: 25.2, lon: 55.27 },
  { lat: 35.68, lon: 139.69 },
  { lat: -23.55, lon: -46.63 },
  { lat: -26.2, lon: 28.04 },
  { lat: 1.35, lon: 103.82 },
  { lat: -33.87, lon: 151.21 },
];

const RUTAS: Array<[number, number]> = [[0, 1], [0, 2], [2, 3], [3, 4]];
// Cada nodo representa una parte distinta del servicio. Aunque la rotación
// solo deja ver algunos a la vez, nunca se repite el concepto de un punto.
const ETIQUETAS = [
  "Cobertura",
  "Resultados",
  "Impacto",
  "Alcance",
  "Presencia",
  "Evidencia",
  "Control",
  "Campañas",
  "Ubicaciones",
] as const;
const MAX_ETIQUETAS_VISIBLES = 4;
const INTERVALO_CUADRO = 1000 / 30;

function aVector({ lat, lon }: PuntoGeografico): Vector3 {
  const latitud = lat * Math.PI / 180;
  const longitud = lon * Math.PI / 180;
  const coseno = Math.cos(latitud);
  return { x: coseno * Math.sin(longitud), y: -Math.sin(latitud), z: coseno * Math.cos(longitud) };
}

function decodificarMascara(base64: string) {
  const binario = atob(base64);
  return Uint8Array.from(binario, (caracter) => caracter.charCodeAt(0));
}

function bitActivo(mascara: Uint8Array, indice: number) {
  return (mascara[indice >> 3] & (1 << (indice & 7))) !== 0;
}

function esTierraEnMascara(lon: number, lat: number) {
  const fila = Math.max(0, Math.min(FILAS_GLOBO - 1, Math.round((lat - LATITUD_MINIMA_GLOBO) / PASO_GLOBO)));
  const columna = Math.max(0, Math.min(COLUMNAS_GLOBO - 1, Math.round((lon + 180) / PASO_GLOBO)));
  return bitActivo(MASCARA_TIERRA, fila * COLUMNAS_GLOBO + columna);
}

const MASCARA_TIERRA = decodificarMascara(MASCARA_TIERRA_GLOBO);
const MASCARA_FRONTERAS = decodificarMascara(MASCARA_FRONTERAS_GLOBO);
const PUNTOS_TIERRA: PuntoEsfera[] = [];
const PUNTOS_FRONTERA: PuntoEsfera[] = [];
const PUNTOS_OCEANO: PuntoEsfera[] = [];
for (let fila = 0; fila < FILAS_GLOBO; fila++) {
  const lat = LATITUD_MINIMA_GLOBO + fila * PASO_GLOBO;
  for (let columna = 0; columna < COLUMNAS_GLOBO; columna++) {
    const indice = fila * COLUMNAS_GLOBO + columna;
    if (bitActivo(MASCARA_TIERRA, indice)) {
      const grupo = bitActivo(MASCARA_FRONTERAS, indice) ? PUNTOS_FRONTERA : PUNTOS_TIERRA;
      const destacado = (fila * 37 + columna * 17) % 53 === 0;
      grupo.push({ vector: aVector({ lat, lon: -180 + columna * PASO_GLOBO }), destacado });
    }
  }
}
// El océano puede ser más espaciado: la precisión importante está en las
// costas y fronteras. Esta segunda trama suma profundidad sin duplicar el
// coste de los 15 000 puntos cartográficos de tierra.
for (let lat = -81; lat <= 81; lat += 2.45) {
  const desfase = Math.round((lat + 81) / 2.45) % 2 === 0 ? 0 : 1.225;
  for (let lon = -180 + desfase; lon < 180; lon += 2.45) {
    if (!esTierraEnMascara(lon, lat)) {
      PUNTOS_OCEANO.push({ vector: aVector({ lat, lon }), destacado: false });
    }
  }
}

function rectanguloRedondeado(
  contexto: CanvasRenderingContext2D,
  x: number,
  y: number,
  ancho: number,
  alto: number,
  radio: number,
) {
  const r = Math.min(radio, ancho / 2, alto / 2);
  contexto.beginPath();
  contexto.moveTo(x + r, y);
  contexto.arcTo(x + ancho, y, x + ancho, y + alto, r);
  contexto.arcTo(x + ancho, y + alto, x, y + alto, r);
  contexto.arcTo(x, y + alto, x, y, r);
  contexto.arcTo(x, y, x + ancho, y, r);
  contexto.closePath();
}

function interpolarEsfera(origen: Vector3, destino: Vector3, progreso: number): Vector3 {
  const producto = Math.max(-1, Math.min(1, origen.x * destino.x + origen.y * destino.y + origen.z * destino.z));
  const angulo = Math.acos(producto);
  if (angulo < 0.001) return origen;
  const seno = Math.sin(angulo);
  const a = Math.sin((1 - progreso) * angulo) / seno;
  const b = Math.sin(progreso * angulo) / seno;
  return { x: origen.x * a + destino.x * b, y: origen.y * a + destino.y * b, z: origen.z * a + destino.z * b };
}

export default function PixelGlobe() {
  const referencia = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = referencia.current;
    if (!canvas) return;

    const contexto = canvas.getContext("2d", { alpha: true });
    if (!contexto) return;

    const escritorio = window.matchMedia("(min-width: 900px)");
    const movimientoReducido = window.matchMedia("(prefers-reduced-motion: reduce)");
    const vectoresNodos = NODOS.map(aVector);
    let ancho = 0;
    let alto = 0;
    let animacion = 0;
    let activo = false;
    let ultimoCuadro = 0;

    const proyectar = (
      vector: Vector3,
      cosenoAngulo: number,
      senoAngulo: number,
      centroX: number,
      centroY: number,
      radio: number,
    ) => {
      const x = vector.x * cosenoAngulo + vector.z * senoAngulo;
      const z = -vector.x * senoAngulo + vector.z * cosenoAngulo;
      const profundidad = (z + 1) / 2;
      return {
        x: centroX + x * radio,
        y: centroY + vector.y * radio,
        z,
        escala: 0.72 + profundidad * 0.38,
      };
    };

    const dibujar = (tiempo: number) => {
      if (!ancho || !alto || !escritorio.matches) return;

      contexto.clearRect(0, 0, ancho, alto);
      // La composición de referencia reserva el tercio superior al mensaje y
      // centra el planeta en la zona inferior. El margen final mantiene la
      // circunferencia completa incluso en un MacBook de 13 pulgadas.
      const radio = Math.min(ancho * 0.39, alto * 0.33);
      const centroX = ancho * 0.5;
      const centroY = alto * 0.65;
      // La longitud avanza en sentido positivo para que el volumen visual
      // gire hacia la derecha. Es deliberadamente lento: se percibe vivo sin
      // competir con el formulario ni marear en pantallas grandes.
      const angulo = movimientoReducido.matches ? -0.62 : -0.62 + tiempo * 0.000092;
      const cosenoAngulo = Math.cos(angulo);
      const senoAngulo = Math.sin(angulo);

      const resplandor = contexto.createRadialGradient(centroX - radio * 0.18, centroY - radio * 0.16, radio * 0.08, centroX, centroY, radio * 1.34);
      resplandor.addColorStop(0, "rgba(128, 187, 255, .20)");
      resplandor.addColorStop(0.57, "rgba(48, 120, 230, .075)");
      resplandor.addColorStop(0.82, "rgba(25, 76, 164, .038)");
      resplandor.addColorStop(1, "rgba(8, 35, 86, 0)");
      contexto.fillStyle = resplandor;
      contexto.beginPath();
      contexto.arc(centroX, centroY, radio * 1.34, 0, Math.PI * 2);
      contexto.fill();

      // Halo atmosférico doble: crea profundidad sin usar filtros costosos ni
      // una segunda animación. La luz principal cae desde arriba a la izquierda.
      contexto.save();
      contexto.strokeStyle = "rgba(202, 225, 255, .18)";
      contexto.lineWidth = Math.max(1, radio * 0.012);
      contexto.shadowColor = "rgba(96, 165, 250, .30)";
      contexto.shadowBlur = Math.max(9, radio * 0.055);
      contexto.beginPath();
      contexto.arc(centroX, centroY, radio * 1.012, 0, Math.PI * 2);
      contexto.stroke();
      contexto.restore();

      contexto.save();
      contexto.translate(centroX, centroY);
      contexto.rotate(-0.22);
      contexto.setLineDash([3, 12]);
      contexto.lineDashOffset = movimientoReducido.matches ? 0 : -tiempo * 0.008;
      contexto.strokeStyle = "rgba(205, 226, 255, .18)";
      contexto.lineWidth = 1;
      contexto.beginPath();
      contexto.ellipse(0, 0, radio * 1.24, radio * 0.79, 0, 0, Math.PI * 2);
      contexto.stroke();
      contexto.restore();

      contexto.save();
      contexto.translate(centroX, centroY);
      contexto.rotate(0.48);
      contexto.setLineDash([1.5, 15]);
      contexto.lineDashOffset = movimientoReducido.matches ? 0 : tiempo * 0.0055;
      contexto.strokeStyle = "rgba(147, 197, 253, .08)";
      contexto.lineWidth = 1;
      contexto.beginPath();
      contexto.ellipse(0, 0, radio * 1.12, radio * 0.93, 0, 0, Math.PI * 2);
      contexto.stroke();
      contexto.restore();

      const esfera = contexto.createRadialGradient(centroX - radio * 0.34, centroY - radio * 0.36, radio * 0.035, centroX + radio * 0.12, centroY + radio * 0.1, radio * 1.06);
      esfera.addColorStop(0, "rgba(130, 188, 255, .24)");
      esfera.addColorStop(0.32, "rgba(67, 139, 239, .15)");
      esfera.addColorStop(0.69, "rgba(19, 68, 156, .105)");
      esfera.addColorStop(1, "rgba(3, 18, 48, .055)");
      contexto.fillStyle = esfera;
      contexto.strokeStyle = "rgba(206, 227, 255, .24)";
      contexto.lineWidth = 1;
      contexto.beginPath();
      contexto.arc(centroX, centroY, radio, 0, Math.PI * 2);
      contexto.fill();
      contexto.stroke();

      // La malla se proyecta una sola vez y se reparte en tres capas de
      // profundidad. Path2D permite iluminar miles de puntos con unos pocos
      // fills por cuadro, sin construir un color diferente para cada punto.
      const capasTierra = [new Path2D(), new Path2D(), new Path2D()];
      const capasFrontera = [new Path2D(), new Path2D(), new Path2D()];
      const capaOceano = new Path2D();
      const capaDestellos = new Path2D();
      const acumularGrupo = (puntos: PuntoEsfera[], capas: Path2D[], tamanoBase: number) => {
        for (const punto of puntos) {
          const proyectado = proyectar(punto.vector, cosenoAngulo, senoAngulo, centroX, centroY, radio);
          if (proyectado.z < -0.06) continue;
          const tamano = tamanoBase * proyectado.escala;
          const indiceCapa = proyectado.z < 0.28 ? 0 : proyectado.z < 0.68 ? 1 : 2;
          capas[indiceCapa].rect(proyectado.x - tamano / 2, proyectado.y - tamano / 2, tamano, tamano);
          if (punto.destacado && proyectado.z > 0.18) {
            const tamanoDestello = tamano * 1.65;
            capaDestellos.rect(
              proyectado.x - tamanoDestello / 2,
              proyectado.y - tamanoDestello / 2,
              tamanoDestello,
              tamanoDestello,
            );
          }
        }
      };

      for (const punto of PUNTOS_OCEANO) {
        const proyectado = proyectar(punto.vector, cosenoAngulo, senoAngulo, centroX, centroY, radio);
        if (proyectado.z < 0.02) continue;
        const tamano = 0.48 * proyectado.escala;
        capaOceano.rect(proyectado.x - tamano / 2, proyectado.y - tamano / 2, tamano, tamano);
      }
      acumularGrupo(PUNTOS_TIERRA, capasTierra, 1.08);
      acumularGrupo(PUNTOS_FRONTERA, capasFrontera, 1.22);

      contexto.fillStyle = "rgba(111, 169, 238, .055)";
      contexto.fill(capaOceano);
      [
        "rgba(146, 191, 247, .22)",
        "rgba(190, 219, 255, .56)",
        "rgba(226, 239, 255, .92)",
      ].forEach((color, indice) => {
        contexto.fillStyle = color;
        contexto.fill(capasTierra[indice]);
      });
      [
        "rgba(181, 214, 255, .34)",
        "rgba(219, 236, 255, .74)",
        "rgba(247, 251, 255, 1)",
      ].forEach((color, indice) => {
        contexto.fillStyle = color;
        contexto.fill(capasFrontera[indice]);
      });

      // Solo una fracción estable de la cartografía recibe halo. Así aparecen
      // los puntos luminosos de la referencia sin aplicar sombras a toda la
      // malla ni introducir parpadeos durante la rotación.
      contexto.save();
      contexto.fillStyle = "rgba(240, 248, 255, .98)";
      contexto.shadowColor = "rgba(126, 184, 255, .95)";
      contexto.shadowBlur = Math.max(3, radio * 0.018);
      contexto.fill(capaDestellos);
      contexto.restore();

      // Luz rasante: refuerza el volumen en el borde superior izquierdo y en
      // la base, dos rasgos visibles en la referencia enviada por el usuario.
      contexto.save();
      contexto.lineCap = "round";
      contexto.shadowColor = "rgba(145, 196, 255, .68)";
      contexto.shadowBlur = Math.max(8, radio * 0.045);
      contexto.strokeStyle = "rgba(222, 237, 255, .62)";
      contexto.lineWidth = Math.max(1, radio * 0.006);
      contexto.beginPath();
      contexto.arc(centroX, centroY, radio * 1.006, Math.PI * 1.08, Math.PI * 1.55);
      contexto.stroke();
      contexto.strokeStyle = "rgba(233, 244, 255, .80)";
      contexto.lineWidth = Math.max(1.2, radio * 0.009);
      contexto.beginPath();
      contexto.arc(centroX, centroY, radio * 1.006, Math.PI * 0.38, Math.PI * 0.64);
      contexto.stroke();
      contexto.restore();

      contexto.save();
      contexto.setLineDash([4, 8]);
      contexto.lineDashOffset = movimientoReducido.matches ? 0 : -tiempo * 0.016;
      contexto.lineCap = "round";
      contexto.lineWidth = 1.35;
      contexto.strokeStyle = "rgba(207, 228, 255, .54)";
      contexto.shadowColor = "rgba(116, 173, 255, .52)";
      contexto.shadowBlur = 8;
      for (const [indiceOrigen, indiceDestino] of RUTAS) {
        contexto.beginPath();
        let trazoIniciado = false;
        for (let paso = 0; paso <= 42; paso++) {
          const punto = proyectar(
            interpolarEsfera(vectoresNodos[indiceOrigen], vectoresNodos[indiceDestino], paso / 42),
            cosenoAngulo,
            senoAngulo,
            centroX,
            centroY,
            radio,
          );
          if (punto.z < 0.02) { trazoIniciado = false; continue; }
          if (!trazoIniciado) { contexto.moveTo(punto.x, punto.y); trazoIniciado = true; }
          else contexto.lineTo(punto.x, punto.y);
        }
        contexto.stroke();
      }
      contexto.restore();

      for (let indice = 0; indice < vectoresNodos.length; indice++) {
        const punto = proyectar(vectoresNodos[indice], cosenoAngulo, senoAngulo, centroX, centroY, radio);
        if (punto.z < 0.02) continue;
        const pulso = movimientoReducido.matches ? 0.5 : (Math.sin(tiempo * 0.003 + indice * 1.4) + 1) / 2;
        contexto.fillStyle = `rgba(147, 197, 253, ${0.08 + pulso * 0.12})`;
        contexto.beginPath();
        contexto.arc(punto.x, punto.y, 9 + pulso * 7, 0, Math.PI * 2);
        contexto.fill();
        contexto.strokeStyle = "rgba(218, 234, 255, .76)";
        contexto.lineWidth = 1;
        contexto.beginPath();
        contexto.arc(punto.x, punto.y, 5.5, 0, Math.PI * 2);
        contexto.stroke();
        contexto.fillStyle = "rgba(243, 248, 255, .95)";
        contexto.beginPath();
        contexto.arc(punto.x, punto.y, 2.1, 0, Math.PI * 2);
        contexto.fill();
      }

      const candidatos = vectoresNodos
        .map((vector, indice) => ({
          etiqueta: ETIQUETAS[indice % ETIQUETAS.length],
          punto: proyectar(vector, cosenoAngulo, senoAngulo, centroX, centroY, radio),
        }))
        .filter(({ punto }) => punto.z > 0.08 && punto.x > ancho * 0.045 && punto.x < ancho * 0.665)
        .sort((a, b) => b.punto.z - a.punto.z);
      const seleccionados: typeof candidatos = [];
      for (const candidato of candidatos) {
        const espacioDisponible = seleccionados.every(({ punto }) => Math.abs(punto.y - candidato.punto.y) >= 58);
        if (espacioDisponible) {
          seleccionados.push(candidato);
        }
        if (seleccionados.length === MAX_ETIQUETAS_VISIBLES) break;
      }

      seleccionados.forEach((candidato) => {
        const texto = candidato.etiqueta;
        const profundidad = Math.min(1, Math.max(0, (candidato.punto.z - 0.08) / 0.24));
        const distanciaBorde = Math.min(1, Math.max(0, (ancho - 26 - candidato.punto.x) / 54));
        const opacidad = Math.min(profundidad, distanciaBorde);
        contexto.save();
        contexto.globalAlpha = opacidad;
        contexto.font = "800 9px Inter, system-ui, sans-serif";
        contexto.textBaseline = "middle";
        const anchoEtiqueta = Math.ceil(contexto.measureText(texto.toUpperCase()).width) + 34;
        const altoEtiqueta = 30;
        const limiteDerecho = ancho * 0.70;
        const espacioDerecho = limiteDerecho - candidato.punto.x;
        const aLaDerecha = espacioDerecho >= anchoEtiqueta + 16;
        const xEtiqueta = aLaDerecha
          ? candidato.punto.x + 16
          : candidato.punto.x - anchoEtiqueta - 16;
        const yEtiqueta = Math.max(20, Math.min(alto - altoEtiqueta - 20, candidato.punto.y - altoEtiqueta / 2));
        const anclaX = aLaDerecha ? xEtiqueta : xEtiqueta + anchoEtiqueta;

        contexto.strokeStyle = "rgba(204, 226, 255, .56)";
        contexto.lineWidth = 1;
        contexto.setLineDash([]);
        contexto.beginPath();
        contexto.moveTo(candidato.punto.x + (aLaDerecha ? 6 : -6), candidato.punto.y);
        contexto.lineTo(anclaX, yEtiqueta + altoEtiqueta / 2);
        contexto.stroke();

        contexto.shadowColor = "rgba(2, 12, 34, .42)";
        contexto.shadowBlur = 18;
        contexto.fillStyle = "rgba(4, 25, 62, .82)";
        rectanguloRedondeado(contexto, xEtiqueta, yEtiqueta, anchoEtiqueta, altoEtiqueta, 15);
        contexto.fill();
        contexto.shadowBlur = 0;
        contexto.strokeStyle = "rgba(191, 219, 254, .25)";
        rectanguloRedondeado(contexto, xEtiqueta, yEtiqueta, anchoEtiqueta, altoEtiqueta, 15);
        contexto.stroke();

        contexto.fillStyle = "#93C5FD";
        contexto.shadowColor = "rgba(147, 197, 253, .82)";
        contexto.shadowBlur = 8;
        contexto.beginPath();
        contexto.arc(xEtiqueta + 14, yEtiqueta + altoEtiqueta / 2, 2.7, 0, Math.PI * 2);
        contexto.fill();
        contexto.shadowBlur = 0;
        contexto.fillStyle = "rgba(239, 246, 255, .88)";
        contexto.fillText(texto.toUpperCase(), xEtiqueta + 23, yEtiqueta + altoEtiqueta / 2 + 0.5);
        contexto.restore();
      });

    };

    const cuadro = (tiempo: number) => {
      if (!activo) return;
      if (tiempo - ultimoCuadro >= INTERVALO_CUADRO) {
        dibujar(tiempo);
        ultimoCuadro = tiempo;
      }
      animacion = window.requestAnimationFrame(cuadro);
    };

    const detener = () => {
      activo = false;
      window.cancelAnimationFrame(animacion);
    };

    const iniciar = () => {
      detener();
      if (!escritorio.matches) {
        contexto.clearRect(0, 0, ancho, alto);
        return;
      }
      dibujar(performance.now());
      if (!movimientoReducido.matches && !document.hidden) {
        activo = true;
        ultimoCuadro = 0;
        animacion = window.requestAnimationFrame(cuadro);
      }
    };

    const redimensionar = () => {
      const caja = canvas.getBoundingClientRect();
      ancho = Math.max(1, Math.round(caja.width));
      alto = Math.max(1, Math.round(caja.height));
      const densidad = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(ancho * densidad);
      canvas.height = Math.round(alto * densidad);
      contexto.setTransform(densidad, 0, 0, densidad, 0, 0);
      iniciar();
    };

    const manejarVisibilidad = () => document.hidden ? detener() : iniciar();
    const observador = new ResizeObserver(redimensionar);
    observador.observe(canvas);
    escritorio.addEventListener("change", iniciar);
    movimientoReducido.addEventListener("change", iniciar);
    document.addEventListener("visibilitychange", manejarVisibilidad);
    redimensionar();

    return () => {
      detener();
      observador.disconnect();
      escritorio.removeEventListener("change", iniciar);
      movimientoReducido.removeEventListener("change", iniciar);
      document.removeEventListener("visibilitychange", manejarVisibilidad);
    };
  }, []);

  return <canvas ref={referencia} className="login-network-globe-canvas" aria-hidden="true" />;
}
