import { useRef, useState } from "react";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import type { Contrato, Panel } from "../../types";
import { db } from "../../config/firebase";
import { subirEvidenciaCloudinary } from "../../config/cloudinary";

interface Props {
  contratos: Contrato[];
  paneles: Record<string, Panel>;
  isAdmin?: boolean;
}

interface FotoConContexto {
  url: string;
  fecha: string;
  panelNombre: string;
  contratoId: string;
}

export default function Evidencias({ contratos, paneles, isAdmin }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [contratoSeleccionado, setContratoSeleccionado] = useState<string>("");

  const fotos: FotoConContexto[] = [];
  for (const c of contratos) {
    for (const f of c.fotos_campania ?? []) {
      fotos.push({
        url: f.url,
        fecha: f.fecha,
        panelNombre: paneles[c.panel_id]?.nombre ?? c.panel_id,
        contratoId: c.id,
      });
    }
  }
  fotos.sort((a, b) => b.fecha.localeCompare(a.fecha));

  const grupos = new Map<string, FotoConContexto[]>();
  for (const f of fotos) {
    const key = f.fecha.split(" ")[0] ?? f.fecha;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key)!.push(f);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !db) return;
    if (!contratoSeleccionado && contratos.length > 1) {
      setError("Selecciona primero a qué campaña pertenece esta evidencia.");
      return;
    }
    const targetId = contratoSeleccionado || contratos[0]?.id;
    if (!targetId) { setError("No hay campañas disponibles."); return; }

    setError(""); setExito(""); setSubiendo(true);
    try {
      const url = await subirEvidenciaCloudinary(file);
      const fecha = new Date().toISOString().slice(0, 10);
      await updateDoc(doc(db, "contratos", targetId), {
        fotos_campania: arrayUnion({ url, fecha }),
      });
      setExito("✓ Evidencia subida correctamente");
      setTimeout(() => setExito(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir. Intenta de nuevo.");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="evidencias-header">
        <div className="ev-logo-row">
          <div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>Evidencias</div>
        </div>
      </div>

      <div className="ev-content" style={{ flex: 1, overflowY: "auto" }}>

        {/* Zona de subida — solo admin */}
        {isAdmin && (
          <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0D1629", marginBottom: 12 }}>
              📸 Subir evidencia
            </div>

            {/* Selector de campaña si hay más de una */}
            {contratos.length > 1 && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 6 }}>
                  Campaña / Panel
                </label>
                <select
                  value={contratoSeleccionado}
                  onChange={(e) => setContratoSeleccionado(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 14, color: "#0D1629", background: "#fff", boxSizing: "border-box" as const }}
                >
                  <option value="">Selecciona una campaña…</option>
                  {contratos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {paneles[c.panel_id]?.nombre ?? c.panel_id} ({c.inicio} – {c.fin})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {error && (
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#DC2626", padding: "10px 12px", borderRadius: 10, fontSize: 12, marginBottom: 10 }}>
                {error}
              </div>
            )}
            {exito && (
              <div style={{ background: "rgba(34,197,94,0.1)", border: "1px solid #BBF7D0", color: "#16A34A", padding: "10px 12px", borderRadius: 10, fontSize: 12, marginBottom: 10 }}>
                {exito}
              </div>
            )}

            <input ref={fileRef} type="file" accept="image/*,video/*" capture="environment" style={{ display: "none" }} onChange={handleFile} />
            <div
              onClick={() => !subiendo && fileRef.current?.click()}
              style={{
                border: "2px dashed #BFDBFE", borderRadius: 14, padding: "20px 16px",
                textAlign: "center", cursor: subiendo ? "default" : "pointer",
                background: subiendo ? "#F0F9FF" : "#EFF6FF",
              }}
            >
              {subiendo ? (
                <>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#2563EB" }}>Subiendo…</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#2563EB" }}>Toca para agregar foto o video</div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>JPG, PNG, MP4 · Máx. 20MB</div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Galería */}
        {fotos.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 24px", color: "#9CA3AF" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🖼️</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Sin evidencias aún</div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              {isAdmin
                ? "Usa el botón de arriba para subir la primera evidencia."
                : "Aquí verás las fotos de tus anuncios en las pantallas en cuanto el equipo las suba."}
            </div>
          </div>
        ) : (
          Array.from(grupos.entries()).map(([fecha, items]) => (
            <div key={fecha}>
              <div className="ev-section-title">{fecha}</div>
              <div className="photo-grid">
                {items.map((f, i) => (
                  <a className="photo-item" key={`${fecha}-${i}`} href={f.url} target="_blank" rel="noreferrer">
                    <img src={f.url} className="evidence-photo-real" alt={`Evidencia ${f.panelNombre}`} />
                    <div className="photo-overlay">
                      <div className="photo-time">{f.fecha}</div>
                      <div className="photo-loc">{f.panelNombre}</div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))
        )}
        <div style={{ height: 16 }} />
      </div>
    </div>
  );
}
