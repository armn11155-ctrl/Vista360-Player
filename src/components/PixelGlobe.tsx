import { useEffect, useRef } from "react";

type PuntoGeografico = { lat: number; lon: number };
type Vector3 = { x: number; y: number; z: number };
type PuntoEsfera = { tierra: boolean; vector: Vector3 };

const CONTINENTES: Array<Array<[number, number]>> = [
  [[-168, 71], [-145, 71], [-124, 60], [-105, 55], [-82, 48], [-60, 48], [-52, 35], [-76, 17], [-98, 18], [-113, 31], [-126, 48], [-151, 58]],
  [[-81, 12], [-67, 10], [-49, -2], [-35, -9], [-44, -25], [-57, -39], [-68, -55], [-76, -43], [-80, -22]],
  [[-54, 82], [-24, 78], [-18, 65], [-43, 58], [-61, 68]],
  [[-11, 36], [2, 45], [22, 56], [43, 61], [63, 56], [92, 69], [126, 61], [151, 49], [179, 53], [161, 35], [135, 24], [111, 18], [99, 8], [77, 7], [60, 23], [45, 29], [32, 34], [19, 31], [7, 36]],
  [[-17, 35], [8, 37], [28, 30], [43, 11], [36, -10], [24, -35], [10, -35], [-5, -17], [-16, 8]],
  [[112, -11], [137, -10], [154, -27], [147, -42], [119, -36], [111, -22]],
  [[130, 33], [143, 45], [146, 35], [138, 30]],
];

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
const ETIQUETAS = ["Cobertura", "Resultados", "Impacto"] as const;
const INTERVALO_CUADRO = 1000 / 30;

function estaDentro(lon: number, lat: number, poligono: Array<[number, number]>) {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, yi] = poligono[i];
    const [xj, yj] = poligono[j];
    const cruza = ((yi > lat) !== (yj > lat)) && (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

function esTierra(lon: number, lat: number) {
  return CONTINENTES.some((continente) => estaDentro(lon, lat, continente));
}

function aVector({ lat, lon }: PuntoGeografico): Vector3 {
  const latitud = lat * Math.PI / 180;
  const longitud = lon * Math.PI / 180;
  const coseno = Math.cos(latitud);
  return { x: coseno * Math.sin(longitud), y: -Math.sin(latitud), z: coseno * Math.cos(longitud) };
}

const PUNTOS: PuntoEsfera[] = [];
for (let lat = -82; lat <= 82; lat += 1.8) {
  const desfase = Math.round((lat + 82) / 1.8) % 2 === 0 ? 0 : 0.9;
  for (let lon = -180 + desfase; lon < 180; lon += 1.8) {
    if (esTierra(lon, lat)) PUNTOS.push({ tierra: true, vector: aVector({ lat, lon }) });
  }
}
for (let lat = -81; lat <= 81; lat += 3) {
  const desfase = Math.round((lat + 81) / 3) % 2 === 0 ? 0 : 1.5;
  for (let lon = -180 + desfase; lon < 180; lon += 3) {
    if (!esTierra(lon, lat)) PUNTOS.push({ tierra: false, vector: aVector({ lat, lon }) });
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
      // En escritorio el formulario vive a la izquierda y la narrativa a la
      // derecha; el planeta se apoya en el lado opuesto al texto para que
      // ambos respiren sin superponerse.
      const centroX = ancho * 0.34;
      const centroY = alto * 0.52;
      const radio = Math.min(ancho * 0.37, alto * 0.405);
      const angulo = movimientoReducido.matches ? -0.55 : -0.55 + tiempo * 0.000105;
      const cosenoAngulo = Math.cos(angulo);
      const senoAngulo = Math.sin(angulo);

      const resplandor = contexto.createRadialGradient(centroX, centroY, radio * 0.12, centroX, centroY, radio * 1.3);
      resplandor.addColorStop(0, "rgba(102, 169, 255, .19)");
      resplandor.addColorStop(0.72, "rgba(43, 112, 222, .07)");
      resplandor.addColorStop(1, "rgba(12, 47, 105, 0)");
      contexto.fillStyle = resplandor;
      contexto.beginPath();
      contexto.arc(centroX, centroY, radio * 1.3, 0, Math.PI * 2);
      contexto.fill();

      contexto.save();
      contexto.translate(centroX, centroY);
      contexto.rotate(-0.22);
      contexto.setLineDash([3, 11]);
      contexto.lineDashOffset = movimientoReducido.matches ? 0 : -tiempo * 0.008;
      contexto.strokeStyle = "rgba(205, 226, 255, .24)";
      contexto.lineWidth = 1;
      contexto.beginPath();
      contexto.ellipse(0, 0, radio * 1.22, radio * 0.78, 0, 0, Math.PI * 2);
      contexto.stroke();
      contexto.restore();

      const esfera = contexto.createRadialGradient(centroX - radio * 0.28, centroY - radio * 0.32, radio * 0.05, centroX, centroY, radio);
      esfera.addColorStop(0, "rgba(99, 165, 255, .17)");
      esfera.addColorStop(0.55, "rgba(28, 92, 193, .10)");
      esfera.addColorStop(1, "rgba(5, 26, 67, .04)");
      contexto.fillStyle = esfera;
      contexto.strokeStyle = "rgba(198, 221, 255, .20)";
      contexto.lineWidth = 1;
      contexto.beginPath();
      contexto.arc(centroX, centroY, radio, 0, Math.PI * 2);
      contexto.fill();
      contexto.stroke();

      for (const punto of PUNTOS) {
        const proyectado = proyectar(punto.vector, cosenoAngulo, senoAngulo, centroX, centroY, radio);
        if (proyectado.z < -0.06) continue;
        const frente = Math.max(0, proyectado.z);
        const tamano = (punto.tierra ? 1.38 : 0.62) * proyectado.escala;
        const opacidad = punto.tierra ? 0.18 + frente * 0.72 : 0.018 + frente * 0.082;
        contexto.fillStyle = `rgba(${punto.tierra ? "225, 238, 255" : "167, 202, 248"}, ${opacidad})`;
        contexto.fillRect(proyectado.x - tamano / 2, proyectado.y - tamano / 2, tamano, tamano);
      }

      contexto.save();
      contexto.setLineDash([4, 8]);
      contexto.lineDashOffset = movimientoReducido.matches ? 0 : -tiempo * 0.016;
      contexto.lineCap = "round";
      contexto.lineWidth = 1.25;
      contexto.strokeStyle = "rgba(196, 220, 255, .58)";
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
        .filter(({ punto }) => punto.z > 0.08 && punto.x > ancho * 0.12 && punto.x < ancho * 0.66)
        .sort((a, b) => b.punto.z - a.punto.z);
      const seleccionados: typeof candidatos = [];
      for (const candidato of candidatos) {
        const etiquetaDisponible = seleccionados.every(({ etiqueta }) => etiqueta !== candidato.etiqueta);
        const espacioDisponible = seleccionados.every(({ punto }) => Math.abs(punto.y - candidato.punto.y) >= 58);
        if (etiquetaDisponible && espacioDisponible) {
          seleccionados.push(candidato);
        }
        if (seleccionados.length === ETIQUETAS.length) break;
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
        const espacioDerecho = ancho - 22 - candidato.punto.x;
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
