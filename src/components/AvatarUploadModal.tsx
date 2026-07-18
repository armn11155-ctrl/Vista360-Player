import { useEffect, useRef, useState } from "react";

interface Props {
  onSubir: (file: File) => Promise<void>;
  onCerrar: () => void;
}

/**
 * Panel chico (no pantalla completa) para subir la foto de perfil de
 * un cliente. Se abre al tocar/pasar el mouse sobre el avatar en
 * Perfil.tsx. Muestra una vista previa cuadrada grande, una barra de
 * progreso mientras se comprime y sube (el porcentaje real solo se
 * conoce al terminar — el resto es una animación suave que nunca pasa
 * de 92% hasta que la subida termina de verdad, para no mentir sobre
 * el avance), y un botón "Aceptar" para confirmar.
 */
export function AvatarUploadModal({ onSubir, onCerrar }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
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
    setPreviewUrl((anterior) => {
      if (anterior) URL.revokeObjectURL(anterior);
      return URL.createObjectURL(file);
    });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) elegirArchivo(file);
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
      await onSubir(archivo);
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

  return (
    <div className="avatar-modal-backdrop" onClick={() => !subiendo && onCerrar()}>
      <div className="avatar-modal" onClick={(e) => e.stopPropagation()}>
        <div className="avatar-modal-title">Cambiar foto de perfil</div>

        <div
          className={`avatar-modal-drop ${previewUrl ? "has-preview" : ""}`}
          onClick={() => !subiendo && inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          {previewUrl ? (
            <img src={previewUrl} alt="" />
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
