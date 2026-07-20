import { useState } from "react";
import type { Cliente, Contrato, Panel } from "../../types";
import { estadoCampana } from "../../types";
import { useSignedUrls } from "../../hooks/useSignedUrls";
import { useInformes } from "../../hooks/useInformes";
import { ReportCard } from "../ReportCard";

interface Props {
  contrato: Contrato;
  panel: Panel | undefined;
  clienteNombre: string;
  cliente: Cliente | null;
  onBack: () => void;
  isAdmin: boolean;
}

type TabId = "resumen" | "reportes";

function Badge({ estado }: { estado: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    Activa:     { bg: "rgba(34,197,94,0.15)",  color: "#16A34A" },
    Programada: { bg: "rgba(8,119,255,0.15)", color: "#0877FF" },
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
    <div style={{ flex: 1, textAlign: "center", padding: "12px 8px", background: "#fff", borderRadius: 12 }}>
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#0B1220" }}>{value}</div>
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

/** Dias totales del contrato (inclusive) -- se usa para estimar el
 *  impacto total de la campaña a partir del transito diario del panel. */
function diasCampana(contrato: Contrato): number {
  const inicio = new Date(`${contrato.inicio}T00:00:00`).getTime();
  const fin = new Date(`${contrato.fin}T00:00:00`).getTime();
  if (Number.isNaN(inicio) || Number.isNaN(fin) || fin < inicio) return 0;
  return Math.round((fin - inicio) / 86400000) + 1;
}

function EmptyReportsIcon() {
  return (
    <svg width="42" height="42" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="7" y="8" width="34" height="32" rx="7" fill="#EEF4FF" />
      <path d="M14 31l7-8 6 6 4-5 4 7" stroke="#0877FF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="17" r="3" fill="#93C5FD" />
      <rect x="7" y="8" width="34" height="32" rx="7" stroke="#BFDBFE" strokeWidth="2" />
    </svg>
  );
}

export default function DetalleCampana({ contrato, panel, clienteNombre, cliente, onBack, isAdmin }: Props) {
  const [tab, setTab] = useState<TabId>("resumen");

  const estado = estadoCampana(contrato);

  // PDF del reporte mensual del cliente (el mismo que se ve en la
  // pantalla de Reportes) — se muestra tambien aca para no tener que
  // salir de la campaña a buscarlo.
  const informesState = useInformes(contrato.cliente_id);
  const informes = informesState.status === "ready" ? informesState.informes : [];
  const keysInformes = informes.flatMap((i) => (i.r2Keys ? [i.r2Keys.digital] : []));
  const urlsInformesFirmadas = useSignedUrls(keysInformes);

  const TABS: { id: TabId; label: string }[] = [
    { id: "resumen",    label: "Resumen" },
    { id: "reportes",   label: "Reportes" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8F9FB" }}>

      {/* Header */}
      <div className="campaign-detail-hero" style={{ padding: "calc(22px + env(safe-area-inset-top)) 20px 18px", flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", padding: 6, marginLeft: -6, cursor: "pointer", display: "flex" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Detalle de campaña</div>
          <div style={{ width: 22 }} />
        </div>

        {/* Nombre / estado / fechas — arriba, ancho completo */}
        <div className="campaign-detail-summary">
          <div className="campaign-detail-title-row">
            <div className="campaign-detail-panel-name">
              {panel?.nombre ?? `Panel ${contrato.panel_id.slice(0,6)}`}
            </div>
            <Badge estado={estado} />
          </div>
          <div className="campaign-detail-meta campaign-detail-meta-first">
            <HeaderIcon type="calendar" />
            <span>{contrato.inicio} - {contrato.fin}</span>
          </div>
          {panel && (
            <div className="campaign-detail-meta">
              <HeaderIcon type="pin" />
              <span>{[panel.direccion, panel.ciudad].filter(Boolean).join(" · ") || panel.nombre}</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ height: 3, background: "#0877FF", flexShrink: 0 }} />

      {/* Tabs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", background: "#fff", borderBottom: "1px solid #E5E7EB", flexShrink: 0 }}>
        {TABS.map((t) => (
          <div key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "16px 0 14px", fontSize: 15, fontWeight: tab === t.id ? 800 : 500,
            color: tab === t.id ? "#0877FF" : "#6B7280",
            borderBottom: tab === t.id ? "3px solid #0877FF" : "3px solid transparent",
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
            <div style={{ background: "#fff", borderRadius: 14, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1220", marginBottom: 10 }}>Estado general</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                  background: estado === "Activa" ? "#22C55E" : estado === "Programada" ? "#0877FF" : "#6B7280",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0B1220" }}>
                    {estado === "Activa" ? "Todo funcionando" : estado === "Programada" ? "Por iniciar" : "Campaña finalizada"}
                  </div>
                  <div style={{ fontSize: 12, color: "#6B7280" }}>Sin incidencias reportadas</div>
                </div>
              </div>
            </div>

            {/* Info del panel */}
            {panel && (
              <div style={{ background: "#fff", borderRadius: 14, padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1220", marginBottom: 10 }}>Ubicación de pantalla</div>
                {panel.lat && panel.lng ? (
                  <div className="campaign-location-map">
                    <iframe
                      title={`Ubicación de ${panel.nombre}`}
                      width="100%"
                      style={{ border: "none" }}
                      loading="lazy"
                      referrerPolicy="strict-origin-when-cross-origin"
                      src={`https://maps.google.com/maps?q=${panel.lat},${panel.lng}&z=18&output=embed`}
                    />
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "#6B7280" }}>{panel.direccion ?? "Sin coordenadas registradas"}</div>
                )}
              </div>
            )}

            {/* Próxima reproducción placeholder */}
            <div style={{ background: "#fff", borderRadius: 14, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1220", marginBottom: 6 }}>Información de la campaña</div>
              <div style={{ fontSize: 13, color: "#6B7280", display: "flex", flexDirection: "column", gap: 6 }}>
                <div>Cara del panel: <strong style={{ color: "#0B1220" }}>{contrato.cara ?? "—"}</strong></div>
                <div>Monto: <strong style={{ color: "#0B1220" }}>${contrato.monto?.toLocaleString() ?? "—"}</strong></div>
                <div>Pago: <strong style={{ color: contrato.pagado ? "#16A34A" : "#EF4444" }}>{contrato.pagado ? "Pagado" : "Pendiente"}</strong></div>
              </div>
            </div>

            {/* Impacto aproximado -- reemplaza a la antigua pantalla
                "Impacto" (que dependia de un sensor que nunca se
                instaló). Con el estimado de tránsito diario que carga
                el admin en el panel, se calcula un numero aproximado
                de personas/vehículos alcanzados durante toda la
                campaña -- no es una medición real, por eso se marca
                bien claro como "aproximado". */}
            <div style={{ background: "#fff", borderRadius: 14, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1220", marginBottom: 6 }}>Impacto aproximado</div>
              {panel?.impactoDiario ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                    background: "#EEF4FF", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0877FF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#0B1220" }}>
                      ≈ {(panel.impactoDiario * diasCampana(contrato)).toLocaleString("es-PE")} personas
                    </div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>
                      Estimado para los {diasCampana(contrato)} días de la campaña (~{panel.impactoDiario.toLocaleString("es-PE")}/día en esta ubicación)
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12.5, color: "#6B7280", lineHeight: 1.5 }}>
                  Aún no hay un estimado de tránsito cargado para este panel. Cuando el admin lo
                  agregue, acá vas a ver el impacto aproximado de esta campaña.
                </div>
              )}
            </div>
          </>
        )}

        {/* ── TAB REPORTES ── */}
        {tab === "reportes" && (
          <div>
            {informesState.status === "loading" && (
              <div style={{ fontSize: 13, color: "#6B7280", textAlign: "center", padding: "24px 0" }}>Cargando…</div>
            )}

            {informesState.status === "error" && (
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#DC2626", padding: "10px 12px", borderRadius: 10, fontSize: 12 }}>
                No se pudo cargar la lista de reportes: {informesState.message}
              </div>
            )}

            {informesState.status === "ready" && informes.length === 0 && (
              <div style={{ background: "#fff", borderRadius: 14, padding: 16, textAlign: "center" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                  <EmptyReportsIcon />
                </div>
                <div style={{ fontSize: 13, color: "#6B7280" }}>Aún no hay un reporte PDF generado para este cliente.</div>
              </div>
            )}

            {informesState.status === "ready" && informes.length > 0 && (
              <div className="reports-list">
                {informes.map((informe) => (
                  <ReportCard
                    key={informe.id}
                    informe={informe}
                    cliente={cliente}
                    clienteId={contrato.cliente_id}
                    isAdmin={isAdmin}
                    onEliminado={informesState.recargar}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
