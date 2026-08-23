type SonidoInterfaz = "navegacion" | "cuenta" | "acceso";

type AudioContextConstructor = typeof AudioContext;

let contexto: AudioContext | null = null;
let ultimoSonidoEn = Number.NEGATIVE_INFINITY;

function obtenerContexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Constructor = (window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext);
  if (!Constructor) return null;
  contexto ??= new Constructor();
  return contexto;
}

/**
 * Safari solo permite habilitar Web Audio dentro de un gesto real. El submit
 * prepara el contexto y el tono de éxito puede reproducirse después de que
 * Firebase responda, sin pedir permisos ni cargar archivos de audio externos.
 */
export function prepararSonidosInterfaz() {
  const audio = obtenerContexto();
  if (audio?.state === "suspended") void audio.resume().catch(() => undefined);
}

function tono(
  audio: AudioContext,
  empiezaEn: number,
  frecuenciaInicial: number,
  frecuenciaFinal: number,
  duracion: number,
  volumen: number,
) {
  const oscilador = audio.createOscillator();
  const ganancia = audio.createGain();
  oscilador.type = "sine";
  oscilador.frequency.setValueAtTime(frecuenciaInicial, empiezaEn);
  oscilador.frequency.exponentialRampToValueAtTime(frecuenciaFinal, empiezaEn + duracion);
  ganancia.gain.setValueAtTime(0.0001, empiezaEn);
  ganancia.gain.exponentialRampToValueAtTime(volumen, empiezaEn + 0.012);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, empiezaEn + duracion);
  oscilador.connect(ganancia);
  ganancia.connect(audio.destination);
  oscilador.start(empiezaEn);
  oscilador.stop(empiezaEn + duracion + 0.015);
}

/** Sonidos cortos y discretos; nunca bloquean una acción si Web Audio falla. */
export function reproducirSonidoInterfaz(tipo: SonidoInterfaz) {
  try {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const ahora = performance.now();
    if (ahora - ultimoSonidoEn < 70) return;
    ultimoSonidoEn = ahora;

    const audio = obtenerContexto();
    if (!audio) return;
    if (audio.state === "suspended") void audio.resume().catch(() => undefined);
    const inicio = audio.currentTime + 0.006;

    if (tipo === "navegacion") {
      tono(audio, inicio, 520, 610, 0.075, 0.018);
      return;
    }
    if (tipo === "cuenta") {
      tono(audio, inicio, 360, 520, 0.12, 0.022);
      tono(audio, inicio + 0.055, 650, 790, 0.11, 0.014);
      return;
    }

    tono(audio, inicio, 440, 660, 0.15, 0.022);
    tono(audio, inicio + 0.09, 660, 880, 0.18, 0.017);
  } catch {
    // El audio es una mejora sensorial, nunca una dependencia funcional.
  }
}
