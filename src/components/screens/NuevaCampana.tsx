import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../config/firebase";

interface Props {
  clienteId: string;
  onBack: () => void;
  onEnviada: () => void;
}

const CIUDADES = ["Lima", "Arequipa", "Trujillo", "Cusco"];

export default function NuevaCampana({ clienteId, onBack, onEnviada }: Props) {
  const [nombre, setNombre] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [presupuesto, setPresupuesto] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [comentarios, setComentarios] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function enviar() {
    setError("");
    if (!nombre.trim()) {
      setError("Ponle un nombre a tu campaña.");
      return;
    }
    if (!db) {
      setError("No se pudo conectar. Intenta de nuevo en un momento.");
      return;
    }
    setEnviando(true);
    try {
      await addDoc(collection(db, "solicitudesCampana"), {
        cliente_id: clienteId,
        nombre: nombre.trim(),
        objetivo: objetivo.trim(),
        presupuesto: presupuesto ? Number(presupuesto) : null,
        ciudades: ciudad ? [ciudad] : [],
        comentarios: comentarios.trim(),
        estado: "Pendiente",
        createdAt: serverTimestamp(),
      });
      onEnviada();
    } catch {
      setError("No se pudo enviar la solicitud. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <div className="wizard-header" style={{ background: "#fff" }}>
        <div className="back-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </div>
        <div className="header-title" style={{ fontSize: 16 }}>Nueva campaña</div>
        <div style={{ width: 20 }} />
      </div>

      <div className="form-content">
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="section-title" style={{ marginBottom: 16 }}>Información de la campaña</div>

          {error && <div className="login-error">{error}</div>}

          <div className="form-group">
            <label className="form-label">Nombre de la campaña</label>
            <input className="form-input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Campaña Invierno 2024" />
          </div>
          <div className="form-group">
            <label className="form-label">Objetivo de la campaña</label>
            <input className="form-input" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="Ej. Dar a conocer nuevo producto" />
          </div>
          <div className="form-group">
            <label className="form-label">Presupuesto estimado (USD)</label>
            <input className="form-input" type="number" value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)} placeholder="Ej. 5000" />
          </div>
          <div className="form-group">
            <label className="form-label">Ciudad</label>
            <select className="form-input form-select" value={ciudad} onChange={(e) => setCiudad(e.target.value)}>
              <option value="" disabled>Selecciona una ciudad</option>
              {CIUDADES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Comentarios adicionales</label>
            <textarea className="form-input form-textarea" value={comentarios} onChange={(e) => setComentarios(e.target.value)} placeholder="Cuéntanos más sobre tu campaña..." />
          </div>
        </div>
      </div>

      <div className="form-footer">
        <button className="btn-primary" disabled={enviando} onClick={enviar}>
          {enviando ? "Enviando…" : "Enviar solicitud"}
        </button>
      </div>
    </div>
  );
}
