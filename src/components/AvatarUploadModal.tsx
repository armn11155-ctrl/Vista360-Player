import { useEffect, useRef, useState } from "react";

interface Props {
  onSubir: (file: File, posicion: { x: number; y: number }) => Promise<void>;
  onCerrar: () => void;
}

interface Posicion {
  x: number;
  y: number;
}

const CENTRO: Posicion = { x: 50, y: 50 };

/**
 * Panel chico (no pantalla completa) para subir la foto de perfil de
 * un cliente. Se abre al tocar/pasar el mouse sobre el avatar en
 * Perfil.tsx.
 *
 * Una vez elegida la foto, se puede arrastrar dentro del marco para
 * elegir qué parte queda visible — el marco muestra en vivo cómo se
 * ve recortada en círculo (así aparece en Perfil) y, chiquito al
 * costado, cómo se ve en cuadrado redondeado (así aparece en el
 * selector de clientes) — mismo recorte, dos formas distintas.
 *
 * Mientras sube, aparece el porcentaje sobre la imagen (real solo al
 * terminar — antes es una animación suave que nunca pasa de 92% para
 * no mentir sobre el avance).
 */
export function AvatarUploadModal({ onSubir, onCerrar }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const arrastreRef = useRef<{ startX: number; startY: number; inicio: Posicion; slackX: number; slackY: number } | null>(null);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [posicion, setPosicion] = useState<Posicion>(CENTRO);
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function elegirArchivo(file: File) {
    if (subiendo) return;
    setArchivo(file);
    setError("");
    setListo(false);
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

  function calcularSlack() {
    const frame = frameRef.current;
    const img = imgRef.current;
    if (!frame || !img || !img.naturalWidth || !img.naturalHeight) return { slackX: 0, slackY: 0 };
    const F = frame.clientWidth;
    const escala = Math.max(F / img.naturalWidth, F / img.naturalHeight);
    const dispW = img.naturalWidth * escala;
    const dispH = img.naturalHeight * escala;
    return { slackX: Math.max(0, dispW - F), slackY: Math.max(0, dispH - F) };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!previewUrl || subiendo) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const { slackX, slackY } = calcularSlack();
    arrastreRef.current = { startX: e.clientX, startY: e.clientY, inicio: posicion, slackX, slackY };
  }

  function onPointerMove(e: React.PointerEvent) {
    const arrastre = arrastreRef.current;
    if (!arrastre) return;
    const dx = e.clientX - arrastre.startX;
    const dy = e.clientY - arrastre.startY;
    const nuevoX = arrastre.slackX > 0 ? arrastre.inicio.x - (dx / arrastre.slackX) * 100 : 50;
    const nuevoY = arrastre.slackY > 0 ? arrastre.inicio.y - (dy / arrastre.slackY) * 100 : 50;
    setPosicion({
      x: Math.min(100, Math.max(0, nuevoX)),
      y: Math.min(100, Math.max(0, nuevoY)),
    });
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

  const objectPosition = `${posicion.x}% ${posicion.y}%`;

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
                  ref={imgRef}
                  src={previewUrl}
                  alt=""
                  draggable={false}
                  style={{ objectPosition }}
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
                <img src={previewUrl} alt="" draggable={false} style={{ objectPosition }} />
              </div>
              <span>Así se ve en la lista de clientes</span>
            </div>
          )}
        </div>

        {previewUrl && !subiendo && (
          <button type="button" className="avatar-modal-elegir-otra" onClick={() => inputRef.current?.click()}>
            Elegir otra foto
          </button>
        )}
        {previewUrl && (
          <div className="avatar-modal-hint">Arrastra la foto para acomodarla</div>
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
