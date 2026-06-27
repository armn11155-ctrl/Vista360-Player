import { useRef, useState } from "react";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import type { Contrato, Panel } from "../../types";
import { estadoCampana } from "../../types";
import { db } from "../../config/firebase";
import { subirEvidenciaCloudinary } from "../../config/cloudinary";

interface Props {
  contrato: Contrato;
  panel: Panel | undefined;
  onBack: () => void;
  /** Solo la cuenta admin puede subir evidencias — el cliente solo mira. */
  isAdmin: boolean;
}

export default function DetalleCampana({ contrato, panel, onBack, isAdmin }: Props) {
  const estado = estadoCampana(contrato);
  const fotos = contrato.fotos_campania ?? [];
  const fileRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !db) return;
    setError("");
    setSubiendo(true);
    try {
      const url = await subirEvidenciaCloudinary(file);
      const fecha = new Date().toISOString().slice(0, 10);
      await updateDoc(doc(db, "contratos", contrato.id), {
        fotos_campania: arrayUnion({ url, fecha }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto.");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div>
      <div className="detail-header" style={{ background: "#fff" }}>
        <div className="back-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </div>
        <div className="header-title" style={{ fontSize: 16 }}>Detalle de campaña</div>
        <div style={{ width: 20 }} />
      </div>

      <div className="campaign-hero">
        <div className="hero-thumb" style={{ width: 64, height: 64, borderRadius: 12, background: "#0D1629", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 22, flexShrink: 0 }}>
          {panel?.icono ?? "🏙️"}
        </div>
        <div className="hero-info">
          <div className="hero-name">Contrato #{contrato.id.slice(0, 6)}</div>
          <div className={`badge ${estado.toLowerCase()}`} style={{ marginBottom: 8 }}>
            {estado}
          </div>
          <div className="hero-meta">📅 {contrato.inicio} – {contrato.fin}</div>
          <div className="hero-meta">📍 {panel?.nombre ?? contrato.panel_id} {panel?.ciudad ? `· ${panel.ciudad}` : ""}</div>
        </div>
      </div>

      <div className="detail-content">
        <div className="section-title">Estado general</div>
        <div className="status-card" style={{ marginBottom: 14 }}>
          <div className="status-icon-big">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <div>
            <div className="status-main-text">
              {estado === "Activa" ? "Todo funcionando" : estado === "Programada" ? "Por iniciar" : "Campaña finalizada"}
            </div>
            <div className="status-sub-text">Sin incidencias reportadas</div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <div className="section-title">Detalle de la campaña</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "#374151" }}>
            <div>Cara del panel: <strong>{contrato.cara ?? "Ambas / Mural"}</strong></div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <div className="section-title">Evidencias ({fotos.length})</div>

          {fotos.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: isAdmin ? 12 : 0 }}>
              {fotos.map((f, i) => (
                <a key={i} href={f.url} target="_blank" rel="noreferrer" style={{ display: "block", position: "relative", borderRadius: 10, overflow: "hidden", aspectRatio: "1" }}>
                  <img src={f.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <span style={{ position: "absolute", bottom: 4, left: 4, fontSize: 9, color: "#fff", background: "rgba(0,0,0,0.55)", padding: "2px 6px", borderRadius: 6 }}>
                    {f.fecha}
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <div className="state-sub" style={{ marginBottom: isAdmin ? 12 : 0 }}>Todavía no hay evidencias.</div>
          )}

          {isAdmin && (
            <>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleFile} />
              {error && <div className="login-error" style={{ marginBottom: 10 }}>{error}</div>}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={subiendo}
                style={{
                  width: "100%", padding: 12, borderRadius: 10,
                  border: "1px solid #E5E7EB", background: "#F9FAFB",
                  color: "#111827", fontWeight: 700, fontSize: 13,
                  cursor: subiendo ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {subiendo ? "Subiendo…" : "📷 Subir evidencia"}
              </button>
            </>
          )}
        </div>

        {panel?.direccion && (
          <div className="card">
            <div className="section-title">Ubicación del panel</div>
            <div style={{ fontSize: 13, color: "#374151" }}>{panel.direccion}</div>
          </div>
        )}
      </div>
    </div>
  );
}
