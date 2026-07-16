import { useEffect, useRef, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
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

function HeaderIcon({ type }: { type: "calendar" | "pin" }) {
  const common = {
    width: 13,
    height: 13,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg {...common} aria-hidden="true">
      {type === "calendar" ? (
        <>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </>
      ) : (
        <>
          <path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" />
          <circle cx="12" cy="10" r="2.4" />
        </>
      )}
    </svg>
  );
}

function EmptyReportsIcon() {
  return (
    <svg width="42" height="42" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="7" y="8" width="34" height="32" rx="7" fill="#EEF4FF" />
      <path d="M14 31l7-8 6 6 4-5 4 7" stroke="#2563EB" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="17" r="3" fill="#93C5FD" />
      <rect x="7" y="8" width="34" height="32" rx="7" stroke="#BFDBFE" strokeWidth="2" />
    </svg>
  );
}

export default function DetalleCampana({ contrato, panel, clienteNombre, onBack, isAdmin }: Props) {
  const [tab, setTab] = useState<TabId>("resumen");
  const [subiendoPortada, setSubiendoPortada] = useState(false);
  const [error, setError] = useState("");
  const [portadaUrl, setPortadaUrl] = useState(contrato.imagenCampaniaUrl ?? "");
  const portadaRef = useRef<HTMLInputElement>(null);

  const estado = estadoCampana(contrato);
  const fotos = contrato.fotos_campania ?? [];
  const imagenPortada = portadaUrl || contrato.imagenCampaniaUrl || fotos[0]?.url || "";

  useEffect(() => {
    setPortadaUrl(contrato.imagenCampaniaUrl ?? "");
  }, [contrato.id, contrato.imagenCampaniaUrl]);

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
      <div style={{ background: "#060C1A", padding: "calc(22px + env(safe-area-inset-top)) 20px 18px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", padding: 6, marginLeft: -6, cursor: "pointer", display: "flex" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Detalle de campaña</div>
          <div style={{ width: 22 }} />
        </div>

        {/* Campaign card in header */}
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
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
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.58)", marginTop: 7, display: "flex", gap: 6, alignItems: "center" }}>
              <HeaderIcon type="calendar" />
              <span>{contrato.inicio} - {contrato.fin}</span>
            </div>
            {panel && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.58)", marginTop: 3, display: "flex", gap: 6, alignItems: "center" }}>
                <HeaderIcon type="pin" />
                <span>{panel.nombre} · {panel.ciudad}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ height: 3, background: "#2563EB", flexShrink: 0 }} />

      {/* Tabs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", background: "#fff", borderBottom: "1px solid #E5E7EB", flexShrink: 0 }}>
        {TABS.map((t) => (
          <div key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "16px 0 14px", fontSize: 15, fontWeight: tab === t.id ? 800 : 500,
            color: tab === t.id ? "#2563EB" : "#6B7280",
            borderBottom: tab === t.id ? "3px solid #2563EB" : "3px solid transparent",
            cursor: "pointer", textAlign: "center",
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
                <div>Pago: <strong style={{ color: contrato.pagado ? "#16A34A" : "#EF4444" }}>{contrato.pagado ? "Pagado" : "Pendiente"}</strong></div>
              </div>
            </div>
          </>
        )}

        {/* ── TAB REPORTES ── */}
        {tab === "reportes" && (
          <div>
            {error && (
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#DC2626", padding: "10px 12px", borderRadius: 10, fontSize: 12, marginBottom: 10 }}>
                {error}
              </div>
            )}

            {/* Galería de evidencias */}
            <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#0D1629" }}>
                  Reportes de campaña
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
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                    <EmptyReportsIcon />
                  </div>
                  <div style={{ fontSize: 13 }}>Aún no hay reportes registrados</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
