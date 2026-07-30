import { useState, type CSSProperties } from "react";
import type { Cliente, Contrato, Panel } from "../../types";
import { estadoCampana, panelesDeContrato } from "../../types";
import { diasHasta, progresoCampana } from "../../utils/fechas";
import { useSignedUrls } from "../../hooks/useSignedUrls";
import { useInformes } from "../../hooks/useInformes";
import { ReportCard } from "../ReportCard";
import { campaignCityImageHero } from "../../utils/campaignCity";
import { formatCampaignName } from "../../utils/campaignName";
import { agruparPorMes, etiquetaMes } from "../../utils/informesGrouping";

interface Props {
  contrato: Contrato;
  /** Mapa id -> Panel de TODOS los paneles conocidos -- se busca acá
   *  adentro la lista completa de paneles de este contrato (puede ser
   *  uno o varios, ver panelesDeContrato), en vez de recibir un solo
   *  panel ya resuelto como antes. */
  paneles: Record<string, Panel>;
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
    Finalizada: { bg: "rgba(107,114,128,0.12)",color: "#64748B" },
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
      <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, color: "#0B1220" }}>{value}</div>
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
      <path d="M14 31l7-8 6 6 4-5 4 7" stroke="#0877FF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="17" r="3" fill="#93C5FD" />
      <rect x="7" y="8" width="34" height="32" rx="7" stroke="#BFDBFE" strokeWidth="2" />
    </svg>
  );
}

export default function DetalleCampana({ contrato, paneles, clienteNombre, cliente, onBack, isAdmin }: Props) {
  const [tab, setTab] = useState<TabId>("resumen");

  const estado = estadoCampana(contrato);

  // Uno o varios paneles segun sea una campaña normal o multi-panel.
  const panelesContrato = panelesDeContrato(contrato).map((id) => paneles[id]).filter((p): p is Panel => !!p);
  const panel = panelesContrato[0];
  const nombrePaneles = panelesContrato.length > 0
    ? panelesContrato.map((p) => p.nombre).join(" + ")
    : `Panel ${contrato.panel_id.slice(0, 6)}`;
  // Si el admin le puso nombre a la campaña, ese es el titulo -- si no
  // (campañas viejas, o cuando no se puso), se sigue mostrando el
  // nombre del/los panel(es) como titulo, como antes.
  const tituloCampana = formatCampaignName(contrato.nombre || nombrePaneles);
  const cityStyle = {
    "--campaign-city-image": `url("${campaignCityImageHero(contrato.id)}")`,
  } as CSSProperties;
  // PDF del reporte mensual del cliente (el mismo que se ve en la
  // pantalla de Reportes) — se muestra tambien aca para no tener que
  // salir de la campaña a buscarlo.
  const informesState = useInformes(contrato.cliente_id);
  // Solo los reportes de ESTA campaña -- useInformes trae todos los del
  // cliente juntos (para la pantalla Reportes.tsx), pero acá antes se
  // mostraban sin filtrar y aparecía la lista completa de reportes del
  // cliente en cualquier campaña que abrieras. contratoId lo guarda
  // generarReporteCliente.ts desde que el reporte se genera por
  // campaña -- reportes viejos sin ese dato no van a aparecer acá (sí
  // siguen viéndose en la pantalla Reportes.tsx general).
  const informes = informesState.status === "ready"
    ? informesState.informes.filter((i) => i.contratoId === contrato.id)
    : [];
  const keysInformes = informes.flatMap((i) => (i.r2Keys ? [i.r2Keys.digital] : []));
  const urlsInformesFirmadas = useSignedUrls(keysInformes);

  const TABS: { id: TabId; label: string }[] = [
    { id: "resumen",    label: "Resumen" },
    { id: "reportes",   label: "Reportes" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8F9FB" }}>

      {/* Header */}
      <div className="campaign-detail-hero" style={{ ...cityStyle, padding: "calc(22px + env(safe-area-inset-top)) 20px 18px", flexShrink: 0, display: "flex", flexDirection: "column" }}>
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
              {tituloCampana}
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
              <span>
                {panelesContrato.length > 1
                  ? panelesContrato.map((p) => p.nombre).join(", ")
                  : [panel.direccion, panel.ciudad].filter(Boolean).join(" · ") || panel.nombre}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="detalle-campana-line" style={{ height: 3, flexShrink: 0 }} />

      {/* Tabs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", background: "#fff", borderBottom: "1px solid #E5E7EB", flexShrink: 0 }}>
        {TABS.map((t) => (
          <div key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "16px 0 14px", fontSize: 14, fontWeight: tab === t.id ? 800 : 500,
            color: tab === t.id ? "#0877FF" : "#64748B",
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
            <div style={{ background: "#fff", borderRadius: 16, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1220", marginBottom: 10 }}>Estado general</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                  background: estado === "Activa" ? "#22C55E" : estado === "Programada" ? "#0877FF" : "#64748B",
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
                  <div style={{ fontSize: 12, color: "#64748B" }}>Sin incidencias reportadas</div>
                </div>
              </div>
            </div>

            {/* Info del panel -- un mapa por cada panel de la campaña
                (antes solo mostraba el primero, aunque hubiera 2+),
                cada uno con su nombre arriba para saber cual es cual. */}
            {panelesContrato.length > 0 && (
              <div style={{ background: "#fff", borderRadius: 16, padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1220", marginBottom: 10 }}>
                  {panelesContrato.length > 1 ? "Ubicación de las pantallas" : "Ubicación de pantalla"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {panelesContrato.map((p) => (
                    <div key={p.id}>
                      {panelesContrato.length > 1 && (
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#0B1220", marginBottom: 6 }}>{p.nombre}</div>
                      )}
                      {p.lat && p.lng ? (
                        <div className="campaign-location-map">
                          <iframe
                            title={`Ubicación de ${p.nombre}`}
                            width="100%"
                            style={{ border: "none" }}
                            loading="lazy"
                            referrerPolicy="strict-origin-when-cross-origin"
                            src={`https://maps.google.com/maps?q=${p.lat},${p.lng}&z=18&output=embed`}
                          />
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: "#64748B" }}>{p.direccion ?? "Sin coordenadas registradas"}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ background: "#fff", borderRadius: 16, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1220", marginBottom: 6 }}>Información de la campaña</div>
              <div style={{ fontSize: 13, color: "#64748B", display: "flex", flexDirection: "column", gap: 6 }}>
                <div>Cara del panel: <strong style={{ color: "#0B1220" }}>{contrato.cara ?? "—"}</strong></div>
                <div>Monto: <strong style={{ color: "#0B1220" }}>${contrato.monto?.toLocaleString() ?? "—"}</strong></div>
                <div>Pago: <strong style={{ color: contrato.pagado ? "#16A34A" : "#EF4444" }}>{contrato.pagado ? "Pagado" : "Pendiente"}</strong></div>
              </div>

              {/* Antes acá no había nada de tiempo/avance -- solo se veían
                  las fechas arriba, en el encabezado, sin decir cuánto
                  falta. MisCampanas.tsx (la lista) ya calculaba este mismo
                  progreso (progresoCampana) para su propia barra, pero acá
                  en el detalle nunca se mostraba -- se reusa el mismo
                  cálculo para que ambas pantallas digan lo mismo. */}
              {estado !== "Finalizada" && (
                <div style={{ marginTop: 12 }}>
                  <div style={{
                    height: 6, borderRadius: 4, overflow: "hidden", background: "#EEF1F5",
                  }}>
                    <div style={{
                      height: "100%", width: `${progresoCampana(contrato.inicio, contrato.fin)}%`,
                      background: "linear-gradient(90deg,#0877FF,#52A5FF)", borderRadius: 4,
                    }} />
                  </div>
                  <div style={{ fontSize: 12, color: "#64748B", marginTop: 6, display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>{progresoCampana(contrato.inicio, contrato.fin)}% del periodo transcurrido</span>
                    <strong style={{ color: "#0B1220" }}>
                      {estado === "Programada"
                        ? `Empieza en ${diasHasta(contrato.inicio)} día${diasHasta(contrato.inicio) === 1 ? "" : "s"}`
                        : diasHasta(contrato.fin) === 0
                          ? "Vence hoy"
                          : diasHasta(contrato.fin) === 1
                            ? "Vence mañana"
                            : `Vence en ${diasHasta(contrato.fin)} días`}
                    </strong>
                  </div>
                </div>
              )}
            </div>

          </>
        )}

        {/* ── TAB REPORTES ── */}
        {tab === "reportes" && (
          <div>
            {informesState.status === "loading" && (
              <div style={{ fontSize: 13, color: "#64748B", textAlign: "center", padding: "24px 0" }}>Cargando…</div>
            )}

            {informesState.status === "error" && (
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#DC2626", padding: "10px 12px", borderRadius: 12, fontSize: 12 }}>
                No se pudo cargar la lista de reportes: {informesState.message}
              </div>
            )}

            {informesState.status === "ready" && informes.length === 0 && (
              <div style={{ background: "#fff", borderRadius: 16, padding: 16, textAlign: "center" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                  <EmptyReportsIcon />
                </div>
                <div style={{ fontSize: 13, color: "#64748B" }}>Aún no hay un reporte PDF generado para esta campaña.</div>
              </div>
            )}

            {informesState.status === "ready" && informes.length > 0 && (
              <>
                {agruparPorMes(informes).map((grupo) => (
                  <div key={grupo.mes}>
                    <div className="reports-month-header">{etiquetaMes(grupo.mes)}</div>
                    <div className="reports-list">
                      {grupo.items.map((informe) => (
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
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
