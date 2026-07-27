import { useMemo, useState } from "react";
import BackChevron from "../BackChevron";
import { useOcupacion, type PanelOcupacion, type PorVencer } from "../../hooks/useOcupacion";

interface Props {
  onBack: () => void;
}

/** Semáforo de urgencia según cuántos días faltan. */
function colorUrgencia(dias: number) {
  if (dias <= 7) return { fondo: "rgba(239,68,68,0.10)", borde: "rgba(239,68,68,0.28)", texto: "#DC2626" };
  if (dias <= 21) return { fondo: "rgba(245,158,11,0.10)", borde: "rgba(245,158,11,0.30)", texto: "#B45309" };
  return { fondo: "rgba(8,119,255,0.08)", borde: "rgba(8,119,255,0.22)", texto: "#0877FF" };
}

function textoDias(dias: number) {
  if (dias < 0) return "vencida";
  if (dias === 0) return "vence hoy";
  if (dias === 1) return "vence mañana";
  return `en ${dias} días`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

function fechaCorta(fecha: string) {
  const [a, m, d] = fecha.split("-").map(Number);
  if (!a || !m || !d) return fecha;
  return `${d} ${MESES[m - 1]} ${a}`;
}

function Kpi({ valor, etiqueta, tono }: { valor: string | number; etiqueta: string; tono?: "alerta" | "ok" }) {
  const color = tono === "alerta" ? "#DC2626" : tono === "ok" ? "#16A34A" : "#0B1220";
  return (
    <div style={{
      flex: "1 1 96px", minWidth: 96, background: "#fff", borderRadius: 14,
      padding: "13px 12px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>
      <div style={{ fontSize: 23, fontWeight: 800, color, lineHeight: 1.1 }}>{valor}</div>
      <div style={{ fontSize: 11, color: "#64748B", marginTop: 4, lineHeight: 1.35 }}>{etiqueta}</div>
    </div>
  );
}

/** Una campaña que está por terminar: a quién hay que llamar. */
function FilaPorVencer({ item }: { item: PorVencer }) {
  const c = colorUrgencia(item.diasRestantes);
  return (
    <div style={{
      background: "#fff", border: `1px solid ${c.borde}`, borderRadius: 12,
      padding: "11px 13px", display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0B1220", overflowWrap: "break-word" }}>
          {item.clienteNombre}
        </div>
        <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 2, overflowWrap: "break-word" }}>
          {item.panelNombre}{item.ciudad ? ` · ${item.ciudad}` : ""}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{
          fontSize: 11.5, fontWeight: 800, color: c.texto, background: c.fondo,
          borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap",
        }}>
          {textoDias(item.diasRestantes)}
        </div>
        <div style={{ fontSize: 10.5, color: "#94A3B8", marginTop: 4, whiteSpace: "nowrap" }}>
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
  // En una lona, tener 1 anunciante ya es estar LLENA (es una pieza
  // física); en una LED, con 1 todavía queda espacio para vender.
  const subtitulo = panel.enMantenimiento
    ? " · En mantenimiento"
    : vacio
      ? panel.nuncaContratado
        ? " · Nunca contratada"
        : panel.diasLibre !== null
          ? ` · Libre hace ${panel.diasLibre} día${panel.diasLibre === 1 ? "" : "s"}`
          : " · Libre"
      : esLona
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
              ? "#CBD5E1"
              : esLona
                ? "#F59E0B"
                : "#16A34A",
        }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#0B1220", overflowWrap: "break-word" }}>
            {panel.nombre}
            <span style={{
              marginLeft: 7, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3,
              verticalAlign: "middle", padding: "2px 6px", borderRadius: 999,
              color: esLona ? "#B45309" : "#0877FF",
              background: esLona ? "rgba(245,158,11,0.13)" : "rgba(8,119,255,0.10)",
            }}>
              {esLona ? "LONA" : "LED"}
            </span>
          </span>
          <span style={{ display: "block", fontSize: 11.5, color: "#64748B", marginTop: 2 }}>
            {panel.ciudad || "Sin ciudad"}{subtitulo}
            {panel.anunciantesProgramados > 0 &&
              ` · ${panel.anunciantesProgramados} programado${panel.anunciantesProgramados === 1 ? "" : "s"}`}
          </span>
        </span>
        {panel.ocupantes.length > 0 && (
          <span aria-hidden="true" style={{
            color: "#94A3B8", fontSize: 15, flexShrink: 0,
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
              <span style={{ color: "#94A3B8", whiteSpace: "nowrap", flexShrink: 0 }}>hasta {fechaCorta(o.fin)}</span>
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
    <div className="admin-tool-screen">
      <div className="detail-header">
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Ocupación</div>
        <div style={{ width: 32 }} />
      </div>

      <div className="content-area" style={{ paddingBottom: 28 }}>
        {state.status === "loading" && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center" }}>Calculando ocupación…</div>
        )}

        {state.status === "error" && (
          <div style={{ marginTop: 20 }}>
            <div style={{
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
              color: "#DC2626", fontSize: 12.5, lineHeight: 1.55, padding: "12px 14px", borderRadius: 12,
            }}>
              {state.message}
            </div>
            <button type="button" onClick={state.recargar} style={{
              marginTop: 12, width: "100%", padding: "12px", borderRadius: 12,
              border: "1.5px solid #E5E7EB", background: "#fff", fontSize: 13.5,
              fontWeight: 700, color: "#0B1220", cursor: "pointer",
            }}>
              Reintentar
            </button>
          </div>
        )}

        {state.status === "ready" && (
          <>
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 4 }}>
              <Kpi valor={`${state.datos.totales.ocupacionPct}%`} etiqueta="Ocupación de pantallas" />
              <Kpi valor={state.datos.totales.trabajando} etiqueta="Trabajando ahora" tono="ok" />
              <Kpi valor={state.datos.totales.libres} etiqueta="Sin anunciante"
                   tono={state.datos.totales.libres > 0 ? "alerta" : undefined} />
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
                <Kpi valor={state.datos.totales.lonas} etiqueta="Lonas y murales" />
                <Kpi valor={state.datos.totales.lonasLibres} etiqueta="Lonas libres"
                     tono={state.datos.totales.lonasLibres > 0 ? "alerta" : undefined} />
                <Kpi valor={state.datos.totales.ledConEspacio} etiqueta="LED con anunciantes" />
              </div>
            )}

            <section style={{ marginTop: 26 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: "#0B1220", margin: "0 0 4px" }}>A quién llamar</h2>
              <p style={{ fontSize: 11.5, color: "#64748B", margin: "0 0 12px", lineHeight: 1.5 }}>
                Campañas que terminan en los próximos {state.datos.ventanaDias} días. Renovar antes de que
                venza evita que la pantalla quede parada.
              </p>
              {state.datos.porVencer.length === 0 ? (
                <div style={{
                  background: "rgba(34,197,94,0.09)", border: "1px solid rgba(34,197,94,0.25)",
                  borderRadius: 12, padding: "12px 14px", fontSize: 12.5, color: "#0B1220",
                }}>
                  Nada vence en los próximos {state.datos.ventanaDias} días.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {state.datos.porVencer.map((item) => (
                    <FilaPorVencer key={`${item.panelId}-${item.clienteId}-${item.fin}`} item={item} />
                  ))}
                </div>
              )}
            </section>

            <section style={{ marginTop: 28 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: "#0B1220", margin: "0 0 10px" }}>Inventario</h2>
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
              marginTop: 22, width: "100%", padding: "12px", borderRadius: 12,
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
