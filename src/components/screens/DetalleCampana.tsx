import { useEffect, useRef, useState } from "react";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import type { Contrato, Panel } from "../../types";
import { estadoCampana } from "../../types";
import { db } from "../../config/firebase";
import { subirEvidenciaCloudinary } from "../../config/cloudinary";
import { comprimirImagen } from "../../utils/comprimirImagen";
import { cloudinaryThumb, esVideo } from "../../utils/cloudinaryUrl";
import { BrandThumb } from "../BrandThumb";

interface Props {
  contrato: Contrato;
  panel: Panel | undefined;
  clienteNombre: string;
  onBack: () => void;
  isAdmin: boolean;
}

type TabId = "resumen" | "reportes";

function Badge({ estado }: { estado: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    Activa:     { bg: "rgba(34,197,94,0.15)",  color: "#16A34A" },
    Programada: { bg: "rgba(59,130,246,0.15)", color: "#2563EB" },
    Finalizada: { bg: "rgba(107,114,128,0.12)",color: "#6B7280" },
  };
  const s = map[estado] ?? map.Finalizada;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", background: s.bg, color: s.color, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>
      {estado}
    </span>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, textAlign: "center", padding: "12px 8px", background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#0D1629" }}>{value}</div>
    </div>
  );
}

export default function DetalleCampana({ contrato, panel, clienteNombre, onBack, isAdmin }: Props) {
  const [tab, setTab] = useState<TabId>("resumen");
  const [subiendo, setSubiendo] = useState(false);
  const [subiendoPortada, setSubiendoPortada] = useState(false);
  const [error, setError] = useState("");
  const [portadaUrl, setPortadaUrl] = useState(contrato.imagenCampaniaUrl ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const portadaRef = useRef<HTMLInputElement>(null);

  const estado = estadoCampana(contrato);
  const fotos = contrato.fotos_campania ?? [];
  const imagenPortada = portadaUrl || contrato.imagenCampaniaUrl || fotos[0]?.url || "";

  useEffect(() => {
    setPortadaUrl(contrato.imagenCampaniaUrl ?? "");
  }, [contrato.id, contrato.imagenCampaniaUrl]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !db) return;
    setError("");
    setSubiendo(true);
    try {
      const archivoOptimizado = await comprimirImagen(file);
      const url = await subirEvidenciaCloudinary(archivoOptimizado);
      const fecha = new Date().toISOString().slice(0, 10);
      await updateDoc(doc(db, "contratos", contrato.id), { fotos_campania: arrayUnion({ url, fecha }) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto.");
    } finally {
      setSubiendo(false);
    }
  }

  async function cambiarPortada(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !db) return;
    setError("");
    setSubiendoPortada(true);
    try {
      const archivoOptimizado = await comprimirImagen(file);
      const url = await subirEvidenciaCloudinary(archivoOptimizado);
      const fecha = new Date().toISOString().slice(0, 10);
      setPortadaUrl(url);
      await updateDoc(doc(db, "contratos", contrato.id), {
        imagenCampaniaUrl: url,
        imagenCampaniaFecha: fecha,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la foto de campaña.");
    } finally {
      setSubiendoPortada(false);
    }
  }

  const TABS: { id: TabId; label: string }[] = [
    { id: "resumen",    label: "Resumen" },
    { id: "reportes",   label: "Reportes" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8F9FB" }}>

      {/* Header */}
      <div style={{ background: "#0D1629", padding: "calc(22px + env(safe-area-inset-top)) 20px 16px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", padding: 6, marginLeft: -6, cursor: "pointer", display: "flex" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Detalle de campaña</div>
          <div style={{ width: 22 }} />
        </div>

        {/* Campaign card in header */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
            {imagenPortada ? (
              <img
                src={cloudinaryThumb(imagenPortada, 180)}
                alt=""
                style={{ width: 72, height: 72, borderRadius: 14, objectFit: "cover", display: "block" }}
              />
            ) : (
              <BrandThumb name={clienteNombre || panel?.nombre || "?"} size={72} radius={14} />
            )}
            {isAdmin && (
              <>
                <input ref={portadaRef} type="file" accept="image/*" style={{ display: "none" }} onChange={cambiarPortada} />
                <button
                  type="button"
                  onClick={() => !subiendoPortada && portadaRef.current?.click()}
                  disabled={subiendoPortada}
                  style={{
                    position: "absolute", left: "50%", bottom: -8, transform: "translateX(-50%)",
                    minHeight: 22, border: "1px solid rgba(147,197,253,.35)", borderRadius: 999,
                    background: "#fff", color: "#2563EB", padding: "0 9px", fontSize: 10.5,
                    fontWeight: 900, boxShadow: "0 8px 18px rgba(2,6,23,.22)", cursor: subiendoPortada ? "default" : "pointer",
                  }}
                >
                  {subiendoPortada ? "..." : "Cambiar"}
                </button>
              </>
            )}
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

            {/* Alcance — datos de cámara IA */}
            <div style={{ background: "#fff", borderRadius: 14, padding: 14, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0D1629" }}>Alcance estimado</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(59,130,246,0.1)", borderRadius: 20, padding: "3px 10px" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3B82F6", animation: "pulse 1.5s infinite" }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#2563EB" }}>Cámara IA</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { label: "Impresiones", icon: "👁️" },
                  { label: "Personas alcanzadas", icon: "👥" },
                  { label: "Horas de reprod.", icon: "⏱️" },
                ].map((m) => (
                  <div key={m.label} style={{ flex: 1, textAlign: "center", padding: "12px 6px", background: "#F8F9FB", borderRadius: 12, border: "1px dashed #E2E8F0" }}>
                    <div style={{ fontSize: 16, marginBottom: 4 }}>{m.icon}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 2 }}>{m.label}</div>
                    <div style={{ fontSize: 12, color: "#CBD5E1", fontWeight: 600 }}>Pendiente</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: "#9CA3AF", textAlign: "center" }}>
                Los datos se actualizarán automáticamente cuando la cámara IA esté conectada.
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

        {/* ── TAB REPORTES ── */}
        {tab === "reportes" && (
          <div>
            {/* Zona de subida — siempre arriba y prominente para el admin */}
            {isAdmin && (
              <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0D1629", marginBottom: 12 }}>
                  Subir reporte
                </div>
                <input ref={fileRef} type="file" accept="image/*,video/*" capture="environment" style={{ display: "none" }} onChange={handleFile} />
                {error && (
                  <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#DC2626", padding: "10px 12px", borderRadius: 10, fontSize: 12, marginBottom: 10 }}>
                    {error}
                  </div>
                )}
                <div
                  onClick={() => !subiendo && fileRef.current?.click()}
                  style={{
                    border: "2px dashed #BFDBFE", borderRadius: 14, padding: "20px 16px",
                    textAlign: "center", cursor: subiendo ? "default" : "pointer",
                    background: subiendo ? "#F0F9FF" : "#EFF6FF",
                    transition: "background 0.15s",
                  }}
                >
                  {subiendo ? (
                    <>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#2563EB" }}>Subiendo foto…</div>
                      <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>Espera un momento</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#2563EB" }}>Toca para agregar foto o video del reporte</div>
                      <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>JPG, PNG, MP4 · Máx. 20MB</div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Galería de evidencias */}
            <div style={{ background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0D1629" }}>
                  Reportes registrados
                </div>
                <div style={{ fontSize: 12, color: "#6B7280", background: "#F3F4F6", borderRadius: 20, padding: "2px 10px" }}>
                  {fotos.length} foto{fotos.length !== 1 ? "s" : ""}
                </div>
              </div>

              {fotos.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                  {[...fotos].reverse().map((f, i) => (
                    <a key={i} href={f.url} target="_blank" rel="noreferrer"
                      style={{ display: "block", borderRadius: 10, overflow: "hidden", aspectRatio: "1", position: "relative" }}>
                      <img
                        src={cloudinaryThumb(f.url, 200)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                      {esVideo(f.url) && (
                        <span
                          aria-hidden="true"
                          style={{
                            position: "absolute", top: 4, right: 4,
                            width: 20, height: 20, borderRadius: 5,
                            background: "rgba(0,0,0,0.45)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </span>
                      )}
                      <span style={{
                        position: "absolute", bottom: 0, left: 0, right: 0,
                        background: "linear-gradient(transparent, rgba(0,0,0,0.6))",
                        padding: "12px 6px 4px", fontSize: 9, color: "#fff", textAlign: "center",
                      }}>
                        {f.fecha}
                      </span>
                    </a>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🖼️</div>
                  <div style={{ fontSize: 13 }}>Aún no hay reportes registrados</div>
                  {isAdmin && <div style={{ fontSize: 12, marginTop: 4 }}>Usa el botón de arriba para agregar el primero</div>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
