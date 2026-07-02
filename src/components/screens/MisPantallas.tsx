import BackChevron from "../BackChevron";
import type { Panel } from "../../types";

interface Props {
  paneles: Record<string, Panel>;
  onBack: () => void;
}

// Se muestra solo si el cliente todavía no tiene paneles contratados
// cargados — así la pantalla nunca se ve vacía mientras llegan datos
// reales de sus campañas.
const MOCK_FALLBACK: Panel[] = [
  { id: "m1", nombre: "Panel Av. Javier Prado", tipo: "Vial", ciudad: "Lima", estado: "Ocupado" },
  { id: "m2", nombre: "Panel Real Plaza", tipo: "Centro comercial", ciudad: "Lima", estado: "Ocupado" },
  { id: "m3", nombre: "Panel Óvalo Higuereta", tipo: "Vial", ciudad: "Lima", estado: "Disponible" },
  { id: "m4", nombre: "Panel Mall Aventura", tipo: "Centro comercial", ciudad: "Trujillo", estado: "Mantenimiento" },
];

function estadoInfo(estado: Panel["estado"]) {
  if (estado === "Mantenimiento") return { color: "#D97706", label: "Mantenimiento" };
  if (estado === "Disponible" || estado === "Libre") return { color: "#8B96AC", label: "En espera" };
  return { color: "#22C55E", label: "Transmitiendo" };
}

export default function MisPantallas({ paneles, onBack }: Props) {
  const lista = Object.values(paneles);
  const items = lista.length > 0 ? lista : MOCK_FALLBACK;

  return (
    <div>
      <div className="detail-header">
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Mis Pantallas</div>
        <div style={{ width: 32 }} />
      </div>
      <div className="content-area">
        {lista.length === 0 && (
          <div className="card" style={{ background: "rgba(59,130,246,0.14)", marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, color: "#1D4ED8", lineHeight: 1.5 }}>
              Aún no tienes pantallas contratadas activas — esto es un ejemplo de cómo se verá el
              monitoreo en vivo de tus paneles.
            </div>
          </div>
        )}
        <div className="screen-grid">
          {items.map((p) => {
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
      </div>
    </div>
  );
}
