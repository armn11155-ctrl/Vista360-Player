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
  isAdmin: boolean;
}

type TabId = "resumen" | "pantallas" | "evidencias";

function Badge({ estado }: { estado: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    Activa:     { bg: "rgba(34,197,94,0.15)",  color: "#16A34A" },
    Programada: { bg: "rgba(59,130,246,0.15)", color: "#2563EB" },
    Finalizada: { bg: "rgba(107,114,128,0.12)",color: "#6B7280" },
  };
  const s = map[estado] ?? map.Finalizada;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", background: s.bg, color: s.color, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>
      {estado}
    </span>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, textAlign: "center", padding: "12px 8px", background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
      <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#0D1629" }}>{value}</div>
    </div>
  );
}

export default function DetalleCampana({ contrato, panel, onBack, isAdmin }: Props) {
  const [tab, setTab] = useState<TabId>("resumen");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const estado = estadoCampana(contrato);
  const fotos = contrato.fotos_campania ?? [];

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !db) return;
    setError("");
    setSubiendo(true);
    try {
      const url = await subirEvidenciaCloudinary(file);
      const fecha = new Date().toISOString().slice(0, 10);
      await updateDoc(doc(db, "contratos", contrato.id), { fotos_campania: arrayUnion({ url, fecha }) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto.");
    } finally {
      setSubiendo(false);
    }
  }

  const TABS: { id: TabId; label: string }[] = [
    { id: "resumen",    label: "Resumen" },
    { id: "pantallas",  label: "Pantallas" },
    { id: "evidencias", label: "Evidencias" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8F9FB" }}>

      {/* Header */}
      <div style={{ background: "#0D1629", padding: "16px 20px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Detalle de campaña</div>
          <div style={{ width: 22 }} />
        </div>

        {/* Campaign card in header */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ width: 72, height: 72, borderRadius: 14, background: "#1F2C42", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
            {panel?.icono ?? "🏙️"}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
              {panel?.nombre ?? `Panel ${contrato.panel_id.slice(0,6)}`}
            </div>
            <Badge estado={estado} />
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 6, display: "flex", gap: 12 }}>
              <span>📅 {contrato.inicio} – {contrato.fin}</span>
            </div>
            {panel && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>📍 {panel.nombre} · {panel.ciudad}</div>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #E5E7EB", flexShrink: 0 }}>
        {TABS.map((t) => (
          <div key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "13px 18px", fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
            color: tab === t.id ? "#2563EB" : "#6B7280",
            borderBottom: tab === t.id ? "2px solid #2563EB" : "2px solid transparent",
            cursor: "pointer",
          }}>
            {t.label}
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>

        {/* ── TAB RESUMEN ── */}
        {tab === "resumen" && (
          <>
            {/* Estado general */}
            <div style={{ background: "#fff", borderRadius: 14, padding: 14, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0D1629", marginBottom: 10 }}>Estado general</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                  background: estado === "Activa" ? "#22C55E" : estado === "Programada" ? "#3B82F6" : "#6B7280",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0D1629" }}>
                    {estado === "Activa" ? "Todo funcionando" : estado === "Programada" ? "Por iniciar" : "Campaña finalizada"}
                  </div>
                  <div style={{ fontSize: 12, color: "#6B7280" }}>Sin incidencias reportadas</div>
                </div>
              </div>
            </div>

            {/* Alcance estimado */}
            <div style={{ background: "#fff", borderRadius: 14, padding: 14, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0D1629", marginBottom: 12 }}>Alcance estimado</div>
              <div style={{ display: "flex", gap: 8 }}>
                <StatBox label="Impresiones"        value="—" />
                <StatBox label="Personas alcanzadas" value="—" />
                <StatBox label="Horas de reprod."   value="—" />
              </div>
            </div>

            {/* Info del panel */}
            {panel && (
              <div style={{ background: "#fff", borderRadius: 14, padding: 14, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0D1629", marginBottom: 10 }}>Ubicación de pantalla</div>
                {panel.lat && panel.lng ? (
                  <div style={{ borderRadius: 12, overflow: "hidden", height: 140, background: "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <iframe
                      title="map"
                      width="100%"
                      height="140"
                      style={{ border: "none" }}
                      src={`https://maps.google.com/maps?q=${panel.lat},${panel.lng}&z=15&output=embed`}
                    />
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "#6B7280" }}>{panel.direccion ?? "Sin coordenadas registradas"}</div>
                )}
              </div>
            )}

            {/* Próxima reproducción placeholder */}
            <div style={{ background: "#fff", borderRadius: 14, padding: 14, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0D1629", marginBottom: 6 }}>Información de la campaña</div>
              <div style={{ fontSize: 13, color: "#6B7280", display: "flex", flexDirection: "column", gap: 6 }}>
                <div>Cara del panel: <strong style={{ color: "#0D1629" }}>{contrato.cara ?? "—"}</strong></div>
                <div>Monto: <strong style={{ color: "#0D1629" }}>${contrato.monto?.toLocaleString() ?? "—"}</strong></div>
                <div>Pago: <strong style={{ color: contrato.pagado ? "#16A34A" : "#EF4444" }}>{contrato.pagado ? "Pagado ✓" : "Pendiente"}</strong></div>
              </div>
            </div>
          </>
        )}

        {/* ── TAB PANTALLAS ── */}
        {tab === "pantallas" && (
          <div style={{ background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0D1629", marginBottom: 12 }}>Pantalla asignada</div>
            {panel ? (
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ width: 48, height: 48, borderRadius: 10, background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                  {panel.icono ?? "🖥️"}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0D1629" }}>{panel.nombre}</div>
                  <div style={{ fontSize: 12, color: "#6B7280" }}>{panel.ciudad} · {panel.tipo}</div>
                  {panel.direccion && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>📍 {panel.direccion}</div>}
                </div>
              </div>
            ) : (
              <div style={{ color: "#6B7280", fontSize: 13 }}>Sin información del panel.</div>
            )}
          </div>
        )}

        {/* ── TAB EVIDENCIAS ── */}
        {tab === "evidencias" && (
          <div style={{ background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0D1629", marginBottom: 12 }}>
              Evidencias ({fotos.length})
            </div>

            {fotos.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: isAdmin ? 14 : 0 }}>
                {fotos.map((f, i) => (
                  <a key={i} href={f.url} target="_blank" rel="noreferrer" style={{ display: "block", borderRadius: 10, overflow: "hidden", aspectRatio: "1", position: "relative" }}>
                    <img src={f.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <span style={{ position: "absolute", bottom: 4, left: 4, fontSize: 9, color: "#fff", background: "rgba(0,0,0,0.55)", padding: "2px 6px", borderRadius: 6 }}>
                      {f.fecha}
                    </span>
                  </a>
                ))}
              </div>
            ) : (
              <div style={{ color: "#6B7280", fontSize: 13, marginBottom: isAdmin ? 14 : 0, textAlign: "center", padding: "24px 0" }}>
                Todavía no hay evidencias registradas.
              </div>
            )}

            {isAdmin && (
              <>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleFile} />
                {error && <div style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444", padding: "10px 12px", borderRadius: 10, fontSize: 12, marginBottom: 10 }}>{error}</div>}
                <button onClick={() => fileRef.current?.click()} disabled={subiendo} style={{
                  width: "100%", padding: 12, borderRadius: 12, border: "1.5px dashed #CBD5E1",
                  background: "#F8F9FB", color: "#2563EB", fontWeight: 600, fontSize: 13,
                  cursor: subiendo ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                  {subiendo ? "Subiendo…" : "Subir evidencia"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
