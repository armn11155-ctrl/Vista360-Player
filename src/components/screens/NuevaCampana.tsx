import { useState } from "react";
import { addDoc, collection, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { usePanelesDisponibles } from "../../hooks/usePanelesDisponibles";

interface Props {
  clienteId: string;
  onBack: () => void;
  onEnviada: () => void;
  isAdmin?: boolean;
}

const CIUDADES = ["Lima", "Arequipa", "Trujillo", "Chiclayo", "Piura", "Cusco", "Iquitos", "Huancayo", "Tacna", "Pucallpa", "Huánuco", "Otra"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 6, letterSpacing: 0.3 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", background: "#fff", border: "1.5px solid #E5E7EB",
  borderRadius: 10, padding: "12px 14px", fontSize: 14, color: "#0D1629",
  outline: "none", boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, appearance: "none",
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center",
};

export default function NuevaCampana({ clienteId, onBack, onEnviada, isAdmin }: Props) {
  // ── Formulario del CLIENTE: pedir una campaña nueva (queda como
  //    solicitud pendiente, la revisa el admin) ──────────────────────
  const [nombre, setNombre] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [presupuesto, setPresupuesto] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [comentarios, setComentarios] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function enviar() {
    setError("");
    if (!nombre.trim()) { setError("Ponle un nombre a tu campaña."); return; }
    if (!clienteId) { setError("Error: no se identificó tu cuenta. Cierra sesión y vuelve a entrar."); return; }
    if (!db) { setError("Sin conexión. Intenta de nuevo."); return; }
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
      setError("No se pudo enviar la solicitud. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  // ── Formulario del ADMIN: crear el contrato real directo ───────────
  const panelesState = usePanelesDisponibles(!!isAdmin);
  const [panelId, setPanelId] = useState("");
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [monto, setMonto] = useState("");
  const [errorAdmin, setErrorAdmin] = useState("");
  const [creando, setCreando] = useState(false);

  async function crearContrato() {
    setErrorAdmin("");
    if (!panelId) { setErrorAdmin("Elige un panel."); return; }
    if (!inicio || !fin) { setErrorAdmin("Pon fecha de inicio y de fin."); return; }
    if (fin < inicio) { setErrorAdmin("La fecha de fin no puede ser antes que la de inicio."); return; }
    if (!monto || Number(monto) < 0) { setErrorAdmin("Pon un monto válido."); return; }
    if (!db) { setErrorAdmin("Sin conexión. Intenta de nuevo."); return; }
    setCreando(true);
    try {
      await addDoc(collection(db, "contratos"), {
        panel_id: panelId,
        cliente_id: clienteId,
        inicio,
        fin,
        monto: Number(monto),
        pagado: false,
        fotos_campania: [],
        createdAt: serverTimestamp(),
      });
      // Marcar el panel como Ocupado (mismo comportamiento que en el ERP)
      await setDoc(doc(db, "paneles", panelId), { estado: "Ocupado" }, { merge: true });
      onEnviada();
    } catch {
      setErrorAdmin("No se pudo crear el contrato. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setCreando(false);
    }
  }

  if (isAdmin) {
    const paneles = panelesState.status === "ready" ? panelesState.paneles : [];
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8F9FB" }}>
        <div style={{ background: "#0D1629", padding: "16px 20px", flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Nuevo contrato</div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0D1629", marginBottom: 18 }}>
              Crear campaña para este cliente
            </div>

            {errorAdmin && (
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#DC2626", fontSize: 13, padding: "10px 14px", borderRadius: 10, marginBottom: 16 }}>
                {errorAdmin}
              </div>
            )}

            <Field label="Panel">
              <select style={selectStyle} value={panelId} onChange={(e) => setPanelId(e.target.value)}>
                <option value="">
                  {panelesState.status === "loading" ? "Cargando paneles…" : "Selecciona un panel"}
                </option>
                {paneles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} — {p.ciudad} {p.estado === "Ocupado" ? "(Ocupado)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <Field label="Fecha de inicio">
                  <input style={inputStyle} type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Fecha de fin">
                  <input style={inputStyle} type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
                </Field>
              </div>
            </div>
            <Field label="Monto (S/)">
              <input style={inputStyle} type="number" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Ej. 3500" />
            </Field>
          </div>
          <div style={{ height: 16 }} />
        </div>

        <div style={{ padding: "12px 16px 20px", background: "#fff", borderTop: "1px solid #F3F4F6", flexShrink: 0 }}>
          <button onClick={crearContrato} disabled={creando} style={{
            width: "100%", padding: "14px", background: creando ? "#93C5FD" : "#2563EB", color: "#fff",
            fontWeight: 700, fontSize: 15, border: "none", borderRadius: 14, cursor: creando ? "default" : "pointer",
          }}>
            {creando ? "Creando…" : "Crear contrato"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8F9FB" }}>
      {/* Header */}
      <div style={{ background: "#0D1629", padding: "16px 20px", flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 0 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Nueva campaña</div>
      </div>

      {/* Form */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0D1629", marginBottom: 18 }}>Información de la campaña</div>

          {error && (
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#DC2626", fontSize: 13, padding: "10px 14px", borderRadius: 10, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <Field label="Nombre de la campaña">
            <input style={inputStyle} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Campaña Invierno 2024" />
          </Field>
          <Field label="Objetivo de la campaña">
            <input style={inputStyle} value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="Ej. Dar a conocer nuevo producto" />
          </Field>
          <Field label="Presupuesto estimado (USD)">
            <input style={inputStyle} type="number" value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)} placeholder="Ej. 5,000" />
          </Field>
          <Field label="Ciudad">
            <select style={selectStyle} value={ciudad} onChange={(e) => setCiudad(e.target.value)}>
              <option value="">Selecciona una ciudad</option>
              {CIUDADES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Comentarios adicionales">
            <textarea style={{ ...inputStyle, minHeight: 80, resize: "none" }} value={comentarios} onChange={(e) => setComentarios(e.target.value)} placeholder="Cuéntanos más sobre tu campaña..." />
          </Field>
        </div>
        <div style={{ height: 16 }} />
      </div>

      {/* Footer */}
      <div style={{ padding: "12px 16px 20px", background: "#fff", borderTop: "1px solid #F3F4F6", flexShrink: 0 }}>
        <button onClick={enviar} disabled={enviando} style={{
          width: "100%", padding: "14px", background: enviando ? "#93C5FD" : "#2563EB", color: "#fff",
          fontWeight: 700, fontSize: 15, border: "none", borderRadius: 14, cursor: enviando ? "default" : "pointer",
        }}>
          {enviando ? "Enviando…" : "Enviar solicitud"}
        </button>
      </div>
    </div>
  );
}
