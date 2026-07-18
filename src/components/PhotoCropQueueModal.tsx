import { useEffect, useRef, useState } from "react";
import { recortarFotoReporte, REPORTE_FOTO_ASPECTO, type PosicionRecorte } from "../utils/comprimirImagen";

interface Resultado {
  dataUrl: string;
  nombre: string;
}

interface Props {
  /** Fotos a ubicar, en el orden en que se subieron. */
  fotos: File[];
  /** Se llama una sola vez, al terminar la última foto, con el recorte final de todas. */
  onCompletar: (resultados: Resultado[]) => void;
  /** Cancela todo el lote — ninguna foto se agrega. */
  onCancelar: () => void;
}

const CENTRO: PosicionRecorte = { x: 50, y: 50, zoom: 1 };
const ZOOM_MAX = 3;

/**
 * Panel para ubicar, una por una, las fotos que van a entrar al PDF del
 * reporte — mismo mecanismo de arrastrar + zoom que "Cambiar foto de
 * perfil", pero con el marco rectangular exacto del recuadro de foto
 * del PDF (en vez de un círculo), para que lo que la persona ve acá sea
 * EXACTAMENTE cómo va a quedar en el reporte, sin que el servidor
 * recorte por su cuenta.
 *
 * Termina una foto (botón "Siguiente") y aparece la próxima, hasta
 * llegar a la última ("Agregar al reporte"). Como el modal de avatar:
 * no se cierra tocando afuera, solo con "Cancelar".
 */
export function PhotoCropQueueModal({ fotos, onCompletar, onCancelar }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const arrastreRef = useRef<{ startX: number; startY: number; inicio: { x: number; y: number }; slackX: number; slackY: number } | null>(null);
  const resultadosRef = useRef<Record<number, Resultado>>({});

  const [indice, setIndice] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [posiciones, setPosiciones] = useState<Record<number, PosicionRecorte>>({});
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");

  const total = fotos.length;
  const archivo = fotos[indice];
  const posicion = posiciones[indice] ?? CENTRO;

  useEffect(() => {
    if (!archivo) return;
    setNatural(null);
    setError("");
    const url = URL.createObjectURL(archivo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  function setPosicionActual(actualizar: (p: PosicionRecorte) => PosicionRecorte) {
    setPosiciones((actuales) => ({ ...actuales, [indice]: actualizar(actuales[indice] ?? CENTRO) }));
  }

  /** Tamaño y posición en pantalla de la imagen dentro del marco, ya con el zoom aplicado. */
  function medidas() {
    const F = frameRef.current?.clientWidth ?? 320;
    const Fh = frameRef.current?.clientHeight ?? F / REPORTE_FOTO_ASPECTO;
    if (!natural) return { F, Fh, dispW: F, dispH: Fh, left: 0, top: 0, slackX: 0, slackY: 0 };
    const base = Math.max(F / natural.w, Fh / natural.h);
    const escala = base * (posicion.zoom ?? 1);
    const dispW = natural.w * escala;
    const dispH = natural.h * escala;
    const slackX = Math.max(0, dispW - F);
    const slackY = Math.max(0, dispH - Fh);
    const left = -(posicion.x / 100) * slackX;
    const top = -(posicion.y / 100) * slackY;
    return { F, Fh, dispW, dispH, left, top, slackX, slackY };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!previewUrl || procesando) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const { slackX, slackY } = medidas();
    arrastreRef.current = { startX: e.clientX, startY: e.clientY, inicio: { x: posicion.x, y: posicion.y }, slackX, slackY };
  }

  function onPointerMove(e: React.PointerEvent) {
    const arrastre = arrastreRef.current;
    if (!arrastre) return;
    const dx = e.clientX - arrastre.startX;
    const dy = e.clientY - arrastre.startY;
    const nuevoX = arrastre.slackX > 0 ? arrastre.inicio.x - (dx / arrastre.slackX) * 100 : 50;
    const nuevoY = arrastre.slackY > 0 ? arrastre.inicio.y - (dy / arrastre.slackY) * 100 : 50;
    setPosicionActual((p) => ({
      ...p,
      x: Math.min(100, Math.max(0, nuevoX)),
      y: Math.min(100, Math.max(0, nuevoY)),
    }));
  }

  function onPointerUp() {
    arrastreRef.current = null;
  }

  async function siguiente() {
    if (!archivo || procesando) return;
    setProcesando(true);
    setError("");
    try {
      const dataUrl = await recortarFotoReporte(archivo, posicion);
      resultadosRef.current[indice] = { dataUrl, nombre: archivo.name };
      if (indice >= total - 1) {
        onCompletar(fotos.map((f, i) => resultadosRef.current[i] ?? { dataUrl, nombre: f.name }));
      } else {
        setIndice((i) => i + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo procesar la foto.");
    } finally {
      setProcesando(false);
    }
  }

  function anterior() {
    if (indice === 0 || procesando) return;
    setIndice((i) => i - 1);
  }

  const { F, dispW, dispH, left, top } = medidas();
  const esUltima = indice >= total - 1;

  if (!archivo) return null;

  return (
    <div className="avatar-modal-backdrop">
      <div className="avatar-modal photo-crop-modal">
        <div className="avatar-modal-title">Ubica la foto en el reporte</div>
        <div className="photo-crop-modal-contador">
          Foto {indice + 1} de {total}
        </div>

        <div
          ref={frameRef}
          className={`avatar-modal-drop photo-crop-modal-frame ${previewUrl ? "has-preview" : ""}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {previewUrl && (
            <img
              key={indice}
              src={previewUrl}
              alt=""
              draggable={false}
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              style={{
                position: "absolute",
                width: dispW || F,
                height: dispH || F / REPORTE_FOTO_ASPECTO,
                left,
                top,
                maxWidth: "none",
              }}
            />
          )}
          {procesando && (
            <div className="avatar-modal-progress-overlay">
              <div className="avatar-modal-progress-ring">…</div>
            </div>
          )}
        </div>

        <div className="avatar-modal-zoom-row">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.2" strokeLinecap="round"><circle cx="10" cy="10" r="6" /><path d="M21 21l-4.35-4.35" /></svg>
          <input
            type="range"
            min={1}
            max={ZOOM_MAX}
            step={0.01}
            value={posicion.zoom ?? 1}
            disabled={procesando}
            onChange={(e) => setPosicionActual((p) => ({ ...p, zoom: Number(e.target.value) }))}
            className="avatar-modal-zoom-slider"
          />
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.2" strokeLinecap="round"><circle cx="10" cy="10" r="7" /><path d="M21 21l-4.35-4.35" /><path d="M10 7v6M7 10h6" /></svg>
        </div>

        <div className="avatar-modal-hint">Arrastra la foto y usa el zoom para acomodarla</div>

        {indice > 0 && !procesando && (
          <button type="button" className="avatar-modal-elegir-otra" onClick={anterior}>
            ← Foto anterior
          </button>
        )}

        {error && <div className="avatar-modal-error">{error}</div>}

        <div className="avatar-modal-actions">
          <button type="button" className="avatar-modal-btn secondary" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </button>
          <button type="button" className="avatar-modal-btn primary" onClick={() => void siguiente()} disabled={procesando}>
            {procesando ? "Procesando…" : esUltima ? "Agregar al reporte" : "Siguiente foto"}
          </button>
        </div>
      </div>
    </div>
  );
}
