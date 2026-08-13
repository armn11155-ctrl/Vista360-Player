import { useMemo, useState, type ReactNode } from "react";
import BackChevron from "../BackChevron";
import { fechaCorta } from "../../utils/fechas";
import { useOcupacion, type FacturaPendiente, type PanelOcupacion, type PorVencer } from "../../hooks/useOcupacion";

interface Props {
  onBack: () => void;
}

/** Semáforo de urgencia según cuántos días faltan. */
function colorUrgencia(dias: number) {
  if (dias <= 7) return { fondo: "rgba(239,68,68,0.10)", borde: "rgba(239,68,68,0.28)", texto: "#DC2626" };
  if (dias <= 21) return { fondo: "rgba(79,70,229,0.09)", borde: "rgba(79,70,229,0.25)", texto: "#4338CA" };
  return { fondo: "rgba(8,119,255,0.08)", borde: "rgba(8,119,255,0.22)", texto: "#0877FF" };
}

function textoDias(dias: number) {
  if (dias < 0) return "vencida";
  if (dias === 0) return "vence hoy";
  if (dias === 1) return "vence mañana";
  return `en ${dias} días`;
}

/** Importes en soles con separador de miles -- sin decimales, que en una
 *  lista de cobranza solo estorban. */
function montoCorto(valor: number, moneda: string) {
  const simbolo = moneda === "USD" ? "$" : "S/";
  return `${simbolo} ${Math.round(valor).toLocaleString("es-PE")}`;
}

/** Una factura emitida y todavía sin cobrar. */
function FilaFactura({ f }: { f: FacturaPendiente }) {
  const c = f.vencida
    ? { fondo: "rgba(239,68,68,0.10)", borde: "rgba(239,68,68,0.28)", texto: "#DC2626" }
    : colorUrgencia(f.diasParaVencer ?? 999);
  return (
    <div style={{
      background: "#fff", border: `1px solid ${c.borde}`, borderRadius: 12,
      padding: "11px 13px", display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0B1220", overflowWrap: "break-word" }}>
          {f.clienteNombre}
        </div>
        <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
          {f.numero}{f.estado ? ` \u00b7 ${f.estado}` : ""}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#0B1220", whiteSpace: "nowrap" }}>
          {montoCorto(f.total, f.moneda)}
        </div>
        <div style={{
          fontSize: 11, fontWeight: 800, color: c.texto, background: c.fondo,
          borderRadius: 999, padding: "2px 8px", marginTop: 4, whiteSpace: "nowrap",
        }}>
          {f.vencida
            ? `vencida hace ${Math.abs(f.diasParaVencer ?? 0)} d`
            : f.diasParaVencer === null
              ? "sin fecha"
              : textoDias(f.diasParaVencer)}
        </div>
      </div>
    </div>
  );
}

function Kpi({ valor, etiqueta, tono }: { valor: string | number; etiqueta: string; tono?: "alerta" | "ok" }) {
  const color = tono === "alerta" ? "#DC2626" : tono === "ok" ? "#16A34A" : "#0B1220";
  return (
    <div style={{
      flex: "1 1 96px", minWidth: 96, background: "#fff", borderRadius: 16,
      padding: "13px 12px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1.1 }}>{valor}</div>
      <div style={{ fontSize: 11, color: "#64748B", marginTop: 4, lineHeight: 1.35 }}>{etiqueta}</div>
    </div>
  );
}

/** Encabezado de sección con insignia de ícono -- mismo patrón que
 *  .report-admin-icon/.report-admin-title en "Generar reporte", para
 *  que Ocupación se sienta igual de cuidada que el resto de las
 *  pantallas "premium" en vez de ser la única con títulos planos. */
function SeccionTitulo({ icon, titulo, sub }: { icon: ReactNode; titulo: string; sub?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: sub ? 4 : 10 }}>
      <span className="report-admin-icon" aria-hidden="true">{icon}</span>
      <div style={{ paddingTop: 2 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: "#0B1220", margin: 0 }}>{titulo}</h2>
        {sub && <p style={{ fontSize: 12, color: "#64748B", margin: "3px 0 0", lineHeight: 1.5 }}>{sub}</p>}
      </div>
    </div>
  );
}

const ICONO_COBRO = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5v9M15 9.8c0-1.3-1.3-2.3-3-2.3s-3 .9-3 2.1c0 3 6 1.4 6 4.4 0 1.2-1.3 2.1-3 2.1s-3-1-3-2.3" />
  </svg>
);
const ICONO_LLAMAR = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6.6 10.8c1.4 2.7 3.6 4.9 6.3 6.3l2.1-2.1c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.5.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.6c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.5.1.4 0 .8-.2 1L6.6 10.8Z" />
  </svg>
);
const ICONO_INVENTARIO = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4.5" width="18" height="11" rx="1.6" />
    <path d="M8.5 20h7M12 15.5V20" />
  </svg>
);
const ICONO_OCUPACION = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19V10M10 19V5M16 19v-7M20 19H4" />
  </svg>
);

/** Una campaña que está por terminar: a quién hay que llamar. */
function FilaPorVencer({ item }: { item: PorVencer }) {
  const c = colorUrgencia(item.diasRestantes);
  return (
    <div className="occupancy-timeline-item" style={{
      background: "#fff", border: `1px solid ${c.borde}`, borderRadius: 12,
      padding: "11px 13px", display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0B1220", overflowWrap: "break-word" }}>
          {item.clienteNombre}
        </div>
        <div style={{ fontSize: 11, color: "#64748B", marginTop: 2, overflowWrap: "break-word" }}>
          {item.panelNombre}{item.ciudad ? ` · ${item.ciudad}` : ""}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{
          fontSize: 11, fontWeight: 800, color: c.texto, background: c.fondo,
          borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap",
        }}>
          {textoDias(item.diasRestantes)}
        </div>
        <div style={{ fontSize: 11, color: "#64748B", marginTop: 4, whiteSpace: "nowrap" }}>
          {fechaCorta(item.fin)}
        </div>
      </div>
    </div>
  );
}

/** Una pantalla del inventario con su carga actual. */
function FilaPanel({ panel }: { panel: PanelOcupacion }) {
  const [abierto, setAbierto] = useState(false);
  const vacio = panel.anunciantesActivos === 0;

  const esLona = panel.modalidad === "lona";
  const esUnipolar = panel.modalidad === "unipolar";
  // Cupo según modalidad: en una lona/mural/paradero, 1 anunciante ya es
  // estar LLENA (una sola cara); en un unipolar hacen falta 2 (una por
  // cara); en LED nunca se considera "llena" por esto, siempre queda
  // espacio para vender.
  const cupo = esUnipolar ? 2 : esLona ? 1 : Infinity;
  const llena = panel.anunciantesActivos >= cupo;
  const subtitulo = panel.enMantenimiento
    ? " · En mantenimiento"
    : vacio
      ? panel.nuncaContratado
        ? " · Nunca contratada"
        : panel.diasLibre !== null
          ? ` · Libre hace ${panel.diasLibre} día${panel.diasLibre === 1 ? "" : "s"}`
          : " · Libre"
      : esUnipolar
        ? ` · ${panel.anunciantesActivos}/2 caras ocupadas`
        : llena
          ? " · Ocupada"
          : ` · ${panel.anunciantesActivos} anunciante${panel.anunciantesActivos === 1 ? "" : "s"}`;

  return (
    <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        style={{
          width: "100%", background: "none", border: "none", padding: "11px 13px",
          display: "flex", alignItems: "center", gap: 11, cursor: "pointer", textAlign: "left",
        }}
      >
        <span aria-hidden="true" style={{
          width: 9, height: 9, borderRadius: "50%", flexShrink: 0,
          background: panel.enMantenimiento
            ? "#7C3AED"
            : vacio
              ? "#94A3B8"
              : llena
                ? "#2563EB"
                : "#16A34A",
        }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#0B1220", overflowWrap: "break-word" }}>
            {panel.nombre}
            <span style={{
              marginLeft: 7, fontSize: 11, fontWeight: 800, letterSpacing: 0.3,
              verticalAlign: "middle", padding: "2px 6px", borderRadius: 999,
              color: esLona || esUnipolar ? "#4338CA" : "#0877FF",
              background: esLona || esUnipolar ? "rgba(79,70,229,0.10)" : "rgba(8,119,255,0.10)",
            }}>
              {esUnipolar ? "UNIPOLAR" : esLona ? "LONA" : "LED"}
            </span>
          </span>
          <span style={{ display: "block", fontSize: 11, color: "#64748B", marginTop: 2 }}>
            {panel.ciudad || "Sin ciudad"}{subtitulo}
            {panel.anunciantesProgramados > 0 &&
              ` · ${panel.anunciantesProgramados} programado${panel.anunciantesProgramados === 1 ? "" : "s"}`}
          </span>
        </span>
        {panel.ocupantes.length > 0 && (
          <span aria-hidden="true" style={{
            color: "#64748B", fontSize: 14, flexShrink: 0,
            transform: abierto ? "rotate(90deg)" : "none", transition: "transform .15s",
          }}>›</span>
        )}
      </button>

      {abierto && panel.ocupantes.length > 0 && (
        <div style={{ borderTop: "1px solid #F1F5F9", padding: "9px 13px 11px" }}>
          {panel.ocupantes.map((o) => (
            <div key={`${o.clienteId}-${o.fin}`} style={{
              display: "flex", justifyContent: "space-between", gap: 10,
              fontSize: 12, padding: "4px 0", color: "#334155",
            }}>
              <span style={{ minWidth: 0, overflowWrap: "break-word" }}>{o.clienteNombre}</span>
              <span style={{ color: "#64748B", whiteSpace: "nowrap", flexShrink: 0 }}>hasta {fechaCorta(o.fin)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Tablero de ocupación del inventario -- solo admin.
 *
 * Responde lo que ninguna otra pantalla contestaba: qué pantallas están
 * trabajando hoy, cuáles se liberan en las próximas semanas (que es
 * cuándo hay que salir a vender, no cuando ya se vaciaron) y cuáles
 * llevan tiempo paradas sin facturar.
 *
 * Como las pantallas son digitales y rotan varios anuncios, no se
 * muestra "ocupado sí/no" sino CUÁNTOS anunciantes tiene cada una.
 */
export default function Ocupacion({ onBack }: Props) {
  const state = useOcupacion();
  const [filtro, setFiltro] = useState<"todas" | "libres" | "trabajando">("todas");

  const panelesFiltrados = useMemo(() => {
    if (state.status !== "ready") return [];
    const todos = state.datos.paneles;
    if (filtro === "libres") return todos.filter((p) => p.anunciantesActivos === 0 && !p.enMantenimiento);
    if (filtro === "trabajando") return todos.filter((p) => p.anunciantesActivos > 0);
    return todos;
  }, [state, filtro]);

  return (
    <div className="admin-tool-screen ocupacion-screen">
      <div className="detail-header">
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Ocupación</div>
        <div style={{ width: 32 }} />
      </div>

      <div className="content-area" style={{ paddingBottom: 28 }}>
        {state.status === "loading" && (
          <div className="premium-loading-panel" role="status">
            <span className="premium-loading-orbit" aria-hidden="true" />
            <div><strong>Preparando ocupación</strong><small>Recuperando el último estado del inventario</small></div>
          </div>
        )}

        {state.status === "error" && (
          <div style={{ marginTop: 20 }}>
            <div style={{
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
              color: "#DC2626", fontSize: 12, lineHeight: 1.55, padding: "12px 14px", borderRadius: 12,
            }}>
              {state.message}
            </div>
            <button type="button" onClick={state.recargar} style={{
              marginTop: 12, width: "100%", padding: "14px", borderRadius: 12,
              border: "1.5px solid #E5E7EB", background: "#fff", fontSize: 13,
              fontWeight: 700, color: "#0B1220", cursor: "pointer",
            }}>
              Reintentar
            </button>
          </div>
        )}

        {state.status === "ready" && (
          <>
            {/* Métrica principal en una tarjeta oscura premium, mismo
               patrón que .report-admin-panel en "Generar reporte" --
               antes era una caja plana más entre varias del mismo
               tamaño, así que el número que de verdad importa (qué
               tan ocupado está el inventario) no resaltaba más que
               cualquier otro dato secundario. */}
            <div className="report-admin-panel" style={{ marginTop: 4 }}>
              <div className="report-admin-header" style={{ marginBottom: 16 }}>
                <span className="report-admin-icon" aria-hidden="true">{ICONO_OCUPACION}</span>
                <div className="report-admin-copy">
                  <div className="report-admin-title">Ocupación de pantallas</div>
                  <div className="report-admin-sub">Qué parte del inventario está trabajando ahora mismo.</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
                <span style={{ fontSize: 46, fontWeight: 800, color: "#fff", lineHeight: 1 }}>
                  {state.datos.totales.ocupacionPct}%
                </span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{
                    fontSize: 11, fontWeight: 800, color: "#4ADE80", background: "rgba(34,197,94,0.14)",
                    border: "1px solid rgba(74,222,128,0.28)", borderRadius: 999, padding: "5px 11px",
                  }}>
                    {state.datos.totales.trabajando} trabajando
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 800,
                    color: state.datos.totales.libres > 0 ? "#F87171" : "#94A3B8",
                    background: state.datos.totales.libres > 0 ? "rgba(239,68,68,0.14)" : "rgba(148,163,184,0.14)",
                    border: state.datos.totales.libres > 0 ? "1px solid rgba(248,113,113,0.28)" : "1px solid rgba(148,163,184,0.24)",
                    borderRadius: 999, padding: "5px 11px",
                  }}>
                    {state.datos.totales.libres} sin anunciante
                  </span>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 9 }}>
              <Kpi valor={state.datos.totales.anunciantesActivos} etiqueta="Campañas al aire" />
              <Kpi valor={state.datos.totales.seLiberanEnVentana}
                   etiqueta={`Vencen en ${state.datos.ventanaDias} días`}
                   tono={state.datos.totales.seLiberanEnVentana > 0 ? "alerta" : undefined} />
              <Kpi valor={state.datos.totales.enMantenimiento} etiqueta="En mantenimiento" />
            </div>
            {state.datos.totales.lonas > 0 && (
              <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 9 }}>
                <Kpi valor={state.datos.totales.lonas} etiqueta="Murales y paraderos" />
                <Kpi valor={state.datos.totales.lonasLibres} etiqueta="Libres"
                     tono={state.datos.totales.lonasLibres > 0 ? "alerta" : undefined} />
                <Kpi valor={state.datos.totales.ledConEspacio} etiqueta="LED con anunciantes" />
              </div>
            )}
            {state.datos.totales.unipolares > 0 && (
              <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 9 }}>
                <Kpi valor={state.datos.totales.unipolares} etiqueta="Unipolares" />
                <Kpi valor={state.datos.totales.unipolaresConEspacio} etiqueta="Unipolares con cara libre"
                     tono={state.datos.totales.unipolaresConEspacio > 0 ? "alerta" : undefined} />
              </div>
            )}

            {state.datos.cobranza.facturas.length > 0 && (
              <section style={{ marginTop: 26 }}>
                <SeccionTitulo icon={ICONO_COBRO} titulo="Pendiente de cobro" />
                <p style={{ fontSize: 12, color: "#64748B", margin: "0 0 12px 52px", lineHeight: 1.5 }}>
                  Facturas emitidas que todavía no figuran como pagadas.
                  {state.datos.cobranza.vencidas > 0 && (
                    <> <strong style={{ color: "#DC2626" }}>
                      {state.datos.cobranza.vencidas === 1
                        ? "1 ya venció"
                        : `${state.datos.cobranza.vencidas} ya vencieron`}
                      {" "}({montoCorto(state.datos.cobranza.totalVencido, "PEN")}).
                    </strong></>
                  )}
                </p>
                <div style={{
                  background: "#0B1220", color: "#fff", borderRadius: 12,
                  padding: "13px 15px", marginBottom: 12,
                  display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12,
                }}>
                  <span style={{ fontSize: 12, color: "#94A3B8" }}>Total por cobrar</span>
                  <strong style={{ fontSize: 19, fontWeight: 800 }}>
                    {montoCorto(state.datos.cobranza.total, "PEN")}
                  </strong>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {state.datos.cobranza.facturas.map((f) => <FilaFactura key={f.id} f={f} />)}
                </div>
              </section>
            )}

            <section style={{ marginTop: 26 }}>
              <SeccionTitulo icon={ICONO_LLAMAR} titulo="A quién llamar" />
              <p style={{ fontSize: 11, color: "#64748B", margin: "0 0 12px 52px", lineHeight: 1.5 }}>
                Campañas que terminan en los próximos {state.datos.ventanaDias} días. Renovar antes de que
                venza evita que la pantalla quede parada.
              </p>
              {state.datos.porVencer.length === 0 ? (
                <div style={{
                  background: "rgba(34,197,94,0.09)", border: "1px solid rgba(34,197,94,0.25)",
                  borderRadius: 12, padding: "12px 14px", fontSize: 12, color: "#0B1220",
                }}>
                  Nada vence en los próximos {state.datos.ventanaDias} días.
                </div>
              ) : (
                <div className="occupancy-timeline">
                  {state.datos.porVencer.map((item) => (
                    <FilaPorVencer key={`${item.panelId}-${item.clienteId}-${item.fin}`} item={item} />
                  ))}
                </div>
              )}
            </section>

            <section style={{ marginTop: 28 }}>
              <SeccionTitulo icon={ICONO_INVENTARIO} titulo="Inventario" />
              <div style={{ display: "flex", gap: 7, marginBottom: 12, flexWrap: "wrap" }}>
                {([
                  ["todas", `Todas (${state.datos.totales.paneles})`],
                  ["libres", `Libres (${state.datos.totales.libres})`],
                  ["trabajando", `Trabajando (${state.datos.totales.trabajando})`],
                ] as const).map(([id, etiqueta]) => (
                  <button key={id} type="button" onClick={() => setFiltro(id)} style={{
                    padding: "7px 12px", borderRadius: 999,
                    border: filtro === id ? "1.5px solid #0877FF" : "1.5px solid #E5E7EB",
                    background: filtro === id ? "rgba(8,119,255,0.08)" : "#fff",
                    color: filtro === id ? "#0877FF" : "#64748B",
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                  }}>
                    {etiqueta}
                  </button>
                ))}
              </div>

              {panelesFiltrados.length === 0 ? (
                <div className="state-sub" style={{ textAlign: "center", marginTop: 16 }}>
                  No hay pantallas en esta categoría.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {panelesFiltrados.map((panel) => <FilaPanel key={panel.id} panel={panel} />)}
                </div>
              )}
            </section>

            <button type="button" onClick={state.recargar} style={{
              marginTop: 22, width: "100%", padding: "14px", borderRadius: 12,
              border: "1.5px solid #E5E7EB", background: "#fff", fontSize: 13,
              fontWeight: 700, color: "#64748B", cursor: "pointer",
            }}>
              Actualizar datos
            </button>
          </>
        )}
      </div>
    </div>
  );
}
