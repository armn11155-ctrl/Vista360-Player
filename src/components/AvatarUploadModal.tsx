import { useEffect, useRef, useState } from "react";
import { comprimirAvatarWebp } from "../utils/comprimirImagen";

interface Posicion {
  x: number;
  y: number;
  zoom: number;
}

interface Props {
  onSubir: (file: File, posicion: Posicion) => Promise<void>;
  onCerrar: () => void;
}

const CENTRO: Posicion = { x: 50, y: 50, zoom: 1 };
const ZOOM_MAX = 3;

function formatoPeso(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 1024 * 100 ? 1 : 0)} KB`;
}

/**
 * Panel chico (no pantalla completa) para subir la foto de perfil de
 * un cliente. Se abre al tocar/pasar el mouse sobre el avatar en
 * Perfil.tsx.
 *
 * Una vez elegida la foto: se arrastra en cualquier dirección para
 * acomodarla, y se puede acercar con el control de zoom (necesario
 * para poder moverla verticalmente cuando la foto es más ancha que
 * alta, o al revés). El marco muestra en vivo cómo se ve recortada en
 * círculo (así aparece en Perfil) y, chiquito al costado, cómo se ve
 * en cuadrado redondeado (así aparece en el selector de clientes) —
 * mismo recorte, dos formas distintas — más el peso estimado ya
 * comprimido.
 *
 * Mientras sube, aparece el porcentaje sobre la imagen (real solo al
 * terminar — antes es una animación suave que nunca pasa de 92% para
 * no mentir sobre el avance).
 */
export function AvatarUploadModal({ onSubir, onCerrar }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const arrastreRef = useRef<{ startX: number; startY: number; inicio: { x: number; y: number }; slackX: number; slackY: number } | null>(null);
  const pesoTimeoutRef = useRef<number | null>(null);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [posicion, setPosicion] = useState<Posicion>(CENTRO);
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState("");
  const [peso, setPeso] = useState<number | null>(null);
  const [calculandoPeso, setCalculandoPeso] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Recalcula el peso comprimido cada vez que cambia la posición/zoom,
  // con un pequeño retraso para no comprimir en cada pixel mientras se
  // arrastra — solo cuando la persona se queda quieta un momento.
  useEffect(() => {
    if (!archivo) {
      setPeso(null);
      return;
    }
    if (pesoTimeoutRef.current) window.clearTimeout(pesoTimeoutRef.current);
    setCalculandoPeso(true);
    pesoTimeoutRef.current = window.setTimeout(() => {
      comprimirAvatarWebp(archivo, posicion)
        .then((f) => setPeso(f.size))
        .catch(() => setPeso(null))
        .finally(() => setCalculandoPeso(false));
    }, 350);
    return () => {
      if (pesoTimeoutRef.current) window.clearTimeout(pesoTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivo, posicion.x, posicion.y, posicion.zoom]);

  function elegirArchivo(file: File) {
    if (subiendo) return;
    setArchivo(file);
    setError("");
    setListo(false);
    setNatural(null);
    setPosicion(CENTRO);
    setPreviewUrl((anterior) => {
      if (anterior) URL.revokeObjectURL(anterior);
      return URL.createObjectURL(file);
    });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    if (previewUrl) return; // ya hay foto elegida: soltar ahí no debe reemplazarla sin querer
    const file = e.dataTransfer.files?.[0];
    if (file) elegirArchivo(file);
  }

  /** Tamaño y posición en pantalla de la imagen dentro del marco, ya con el zoom aplicado. */
  function medidas() {
    const F = frameRef.current?.clientWidth ?? 240;
    if (!natural) return { F, dispW: F, dispH: F, left: 0, top: 0, slackX: 0, slackY: 0 };
    const base = Math.max(F / natural.w, F / natural.h);
    const escala = base * posicion.zoom;
    const dispW = natural.w * escala;
    const dispH = natural.h * escala;
    const slackX = Math.max(0, dispW - F);
    const slackY = Math.max(0, dispH - F);
    const left = -(posicion.x / 100) * slackX;
    const top = -(posicion.y / 100) * slackY;
    return { F, dispW, dispH, left, top, slackX, slackY };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!previewUrl || subiendo) return;
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
    setPosicion((p) => ({
      ...p,
      x: Math.min(100, Math.max(0, nuevoX)),
      y: Math.min(100, Math.max(0, nuevoY)),
    }));
  }

  function onPointerUp() {
    arrastreRef.current = null;
  }

  async function confirmar() {
    if (!archivo || subiendo) return;
    setSubiendo(true);
    setError("");
    setProgreso(6);

    const intervalo = window.setInterval(() => {
      setProgreso((p) => (p < 92 ? p + Math.max(1, (92 - p) / 8) : p));
    }, 150);

    try {
      await onSubir(archivo, posicion);
      window.clearInterval(intervalo);
      setProgreso(100);
      setListo(true);
      window.setTimeout(onCerrar, 550);
    } catch (err) {
      window.clearInterval(intervalo);
      setSubiendo(false);
      setProgreso(0);
      setError(err instanceof Error ? err.message : "No se pudo subir la foto.");
    }
  }

  const { F, dispW, dispH, left, top } = medidas();

  return (
    <div className="avatar-modal-backdrop" onClick={() => !subiendo && onCerrar()}>
      <div className="avatar-modal" onClick={(e) => e.stopPropagation()}>
        <div className="avatar-modal-title">Cambiar foto de perfil</div>

        <div className="avatar-modal-frames">
          <div
            ref={frameRef}
            className={`avatar-modal-drop ${previewUrl ? "has-preview" : ""}`}
            onClick={() => !previewUrl && !subiendo && inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            {previewUrl ? (
              <>
                <img
                  src={previewUrl}
                  alt=""
                  draggable={false}
                  onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                  style={{
                    position: "absolute",
                    width: dispW || F,
                    height: dispH || F,
                    left,
                    top,
                    maxWidth: "none",
                  }}
                />
                <div className="avatar-modal-drop-mask" aria-hidden="true" />
              </>
            ) : (
              <div className="avatar-modal-drop-empty">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
                  <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                </svg>
                <span>Sube la foto</span>
              </div>
            )}
            {subiendo && (
              <div className="avatar-modal-progress-overlay">
                <div className="avatar-modal-progress-ring">{Math.round(progreso)}%</div>
              </div>
            )}
          </div>

          {previewUrl && (
            <div className="avatar-modal-mini-preview">
              <div className="avatar-modal-mini-square">
                <img
                  src={previewUrl}
                  alt=""
                  draggable={false}
                  style={{ position: "absolute", width: dispW || F, height: dispH || F, left, top, maxWidth: "none" }}
                />
              </div>
              <span>Así se ve en la lista de clientes</span>
              <span className="avatar-modal-peso">
                {calculandoPeso ? "calculando…" : peso !== null ? formatoPeso(peso) : "—"}
              </span>
            </div>
          )}
        </div>

        {previewUrl && (
          <div className="avatar-modal-zoom-row">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.2" strokeLinecap="round"><circle cx="10" cy="10" r="6" /><path d="M21 21l-4.35-4.35" /></svg>
            <input
              type="range"
              min={1}
              max={ZOOM_MAX}
              step={0.01}
              value={posicion.zoom}
              disabled={subiendo}
              onChange={(e) => setPosicion((p) => ({ ...p, zoom: Number(e.target.value) }))}
              className="avatar-modal-zoom-slider"
            />
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.2" strokeLinecap="round"><circle cx="10" cy="10" r="7" /><path d="M21 21l-4.35-4.35" /><path d="M10 7v6M7 10h6" /></svg>
          </div>
        )}

        {previewUrl && !subiendo && (
          <button type="button" className="avatar-modal-elegir-otra" onClick={() => inputRef.current?.click()}>
            Elegir otra foto
          </button>
        )}
        {previewUrl && (
          <div className="avatar-modal-hint">Arrastra la foto y usa el zoom para acomodarla</div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="avatar-modal-input-hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) elegirArchivo(file);
          }}
        />

        {error && <div className="avatar-modal-error">{error}</div>}

        <div className="avatar-modal-actions">
          <button type="button" className="avatar-modal-btn secondary" onClick={onCerrar} disabled={subiendo}>
            Cancelar
          </button>
          <button type="button" className="avatar-modal-btn primary" onClick={() => void confirmar()} disabled={!archivo || subiendo}>
            {subiendo ? `Subiendo… ${Math.round(progreso)}%` : listo ? "Listo" : "Aceptar"}
          </button>
        </div>
      </div>
    </div>
  );
}
