import BackChevron from "../BackChevron";
import type { Panel } from "../../types";

interface Props {
  paneles: Record<string, Panel>;
  onBack: () => void;
}

function estadoInfo(estado: Panel["estado"]) {
  if (estado === "Mantenimiento") return { color: "#D97706", label: "Mantenimiento" };
  if (estado === "Disponible" || estado === "Libre") return { color: "#8B96AC", label: "En espera" };
  return { color: "#22C55E", label: "Transmitiendo" };
}

export default function MisPantallas({ paneles, onBack }: Props) {
  const lista = Object.values(paneles);

  return (
    <div>
      <div className="detail-header">
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Mis Publicidades</div>
        <div style={{ width: 32 }} />
      </div>
      <div className="content-area screens-premium-area">
        <div className="screens-premium-hero">
          <div>
            <div className="screens-premium-kicker">Vista360 Player</div>
            <div className="screens-premium-title">Publicidades activas</div>
            <div className="screens-premium-sub">
              Estado operativo de las ubicaciones donde tu campaña está publicada.
            </div>
          </div>
          <div className="screens-premium-metric">
            <span>{lista.length}</span>
            <small>activas</small>
          </div>
        </div>
        {lista.length === 0 && (
          <div className="screens-empty-premium">
            <div className="screens-empty-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" strokeWidth="2">
                <rect x="2" y="4" width="20" height="13" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
            </div>
            <div className="screens-empty-title">Aún no hay publicidades activas</div>
            <div className="screens-empty-sub">
              Cuando tu campaña esté publicada, aquí verás cada ubicación y su estado.
            </div>
          </div>
        )}
        {lista.length > 0 && (
        <div className="screen-grid">
          {lista.map((p) => {
            const info = estadoInfo(p.estado);
            const live = info.label === "Transmitiendo";
            return (
              <div className="screen-card" key={p.id}>
                <div className="screen-thumb">
                  {live && (
                    <div className="screen-live-badge">
                      <span className="screen-live-dot" />
                      EN VIVO
                    </div>
                  )}
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="rgba(255,255,255,.55)">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
                <div className="screen-info">
                  <div className="screen-name">{p.nombre}</div>
                  <div className="screen-city">{p.ciudad}</div>
                  <div className="screen-status" style={{ color: info.color }}>
                    <span className="screen-status-dot" style={{ background: info.color }} />
                    {info.label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}
