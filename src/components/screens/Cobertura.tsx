import { useMemo, useState } from "react";
import BackChevron from "../BackChevron";
import type { Contrato, Panel } from "../../types";

interface Props {
  paneles: Record<string, Panel>;
  contratos: Contrato[];
  onBack?: () => void;
}

type PanelConUso = Panel & {
  contrato?: Contrato;
};

type PanelConCoordenadas = PanelConUso & {
  lat: number;
  lng: number;
};

function tieneCoordenadas(panel: PanelConUso): panel is PanelConCoordenadas {
  return typeof panel.lat === "number" && typeof panel.lng === "number";
}

function estadoTexto(contrato?: Contrato) {
  if (!contrato) return "Panel asignado";
  const hoy = new Date();
  const inicio = new Date(contrato.inicio);
  const fin = new Date(contrato.fin);
  if (hoy < inicio) return "Programado";
  if (hoy > fin) return "Finalizado";
  return "Activo";
}

function estadoColor(label: string) {
  if (label === "Activo") return "#22C55E";
  if (label === "Programado") return "#F59E0B";
  if (label === "Finalizado") return "#94A3B8";
  return "#60A5FA";
}

export default function Cobertura({ paneles, contratos, onBack }: Props) {
  const lista = useMemo<PanelConUso[]>(() => {
    const usados = new Map(contratos.map((contrato) => [contrato.panel_id, contrato]));
    return Object.values(paneles)
      .map((panel) => ({ ...panel, contrato: usados.get(panel.id) }))
      .sort((a, b) => (a.ciudad || "").localeCompare(b.ciudad || "") || a.nombre.localeCompare(b.nombre));
  }, [contratos, paneles]);

  const conCoordenadas = lista.filter(tieneCoordenadas);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const seleccionado = lista.find((panel) => panel.id === seleccionadoId) ?? conCoordenadas[0] ?? lista[0];

  const bounds = useMemo(() => {
    if (conCoordenadas.length === 0) return null;
    const lats = conCoordenadas.map((panel) => panel.lat);
    const lngs = conCoordenadas.map((panel) => panel.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return {
      minLat: minLat === maxLat ? minLat - 0.01 : minLat,
      maxLat: minLat === maxLat ? maxLat + 0.01 : maxLat,
      minLng: minLng === maxLng ? minLng - 0.01 : minLng,
      maxLng: minLng === maxLng ? maxLng + 0.01 : maxLng,
    };
  }, [conCoordenadas]);

  function posicion(panel: PanelConCoordenadas) {
    if (!bounds) return { left: "50%", top: "50%" };
    const x = ((panel.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 76 + 12;
    const y = (1 - (panel.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 70 + 14;
    return { left: `${x}%`, top: `${y}%` };
  }

  return (
    <div>
      <div className="detail-header">
        {onBack ? (
          <div className="back-btn" onClick={onBack}>
            <BackChevron />
          </div>
        ) : <div style={{ width: 32 }} />}
        <div className="simple-title">Cobertura</div>
        <div style={{ width: 32 }} />
      </div>

      <div className="content-area coverage-premium-area">
        <div className="coverage-hero">
          <div>
            <div className="coverage-kicker">Mapa de campaña</div>
            <div className="coverage-title">Paneles del cliente</div>
            <div className="coverage-sub">
              Ubicación de las pantallas contratadas y estado de cada punto.
            </div>
          </div>
          <div className="coverage-count">
            <span>{lista.length}</span>
            <small>paneles</small>
          </div>
        </div>

        <div className="coverage-map-real">
          {conCoordenadas.length > 0 && bounds ? (
            <>
              <div className="coverage-map-grid" />
              {conCoordenadas.map((panel) => {
                const active = panel.id === seleccionado?.id;
                return (
                  <button
                    key={panel.id}
                    type="button"
                    className={`coverage-map-pin ${active ? "active" : ""}`}
                    style={posicion(panel)}
                    onClick={() => setSeleccionadoId(panel.id)}
                    title={panel.nombre}
                  >
                    <span />
                  </button>
                );
              })}
              <div className="coverage-map-label">
                {seleccionado?.ciudad || "Ubicación"} · {conCoordenadas.length} con coordenadas
              </div>
            </>
          ) : (
            <div className="coverage-no-coords">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" strokeWidth="1.8">
                <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z" />
                <path d="M9 3v15M15 6v15" />
              </svg>
              <div>Aún no hay coordenadas registradas para estos paneles.</div>
            </div>
          )}
        </div>

        {seleccionado && (
          <div className="coverage-selected-card">
            <div>
              <div className="coverage-selected-name">{seleccionado.nombre}</div>
              <div className="coverage-selected-address">
                {[seleccionado.direccion, seleccionado.ciudad].filter(Boolean).join(" · ") || "Sin dirección registrada"}
              </div>
            </div>
            <div className="coverage-selected-status" style={{ color: estadoColor(estadoTexto(seleccionado.contrato)) }}>
              <span style={{ background: estadoColor(estadoTexto(seleccionado.contrato)) }} />
              {estadoTexto(seleccionado.contrato)}
            </div>
          </div>
        )}

        <div className="card">
          <div className="section-title">Paneles ubicados</div>
          {lista.length === 0 ? (
            <div className="state-sub" style={{ maxWidth: "none" }}>
              Este cliente todavía no tiene paneles asignados.
            </div>
          ) : (
            lista.map((panel) => {
              const label = estadoTexto(panel.contrato);
              const color = estadoColor(label);
              return (
                <button
                  key={panel.id}
                  type="button"
                  className="coverage-panel-row"
                  onClick={() => setSeleccionadoId(panel.id)}
                >
                  <div className="coverage-panel-dot" style={{ background: color }} />
                  <div className="coverage-panel-info">
                    <div className="coverage-panel-name">{panel.nombre}</div>
                    <div className="coverage-panel-meta">
                      {panel.ciudad || "Sin ciudad"} · {tieneCoordenadas(panel) ? "Con coordenadas" : "Sin coordenadas"}
                    </div>
                  </div>
                  <div className="coverage-panel-state" style={{ color }}>
                    {label}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
