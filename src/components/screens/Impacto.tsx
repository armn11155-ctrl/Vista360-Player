import BackChevron from "../BackChevron";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const VEHICULOS = [3200, 4100, 3800, 4600, 5200, 6800, 5900];
const MAX_V = Math.max(...VEHICULOS);
const TOTAL = VEHICULOS.reduce((a, b) => a + b, 0);
const PROMEDIO = Math.round(TOTAL / VEHICULOS.length);

interface Props {
  onBack: () => void;
}

export default function Impacto({ onBack }: Props) {
  return (
    <div>
      <div className="detail-header">
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Impacto</div>
        <div style={{ width: 32 }} />
      </div>
      <div className="content-area">
        <div className="card" style={{ background: "rgba(59,130,246,0.14)", marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, color: "#1D4ED8", lineHeight: 1.5 }}>
            Datos de ejemplo — el conteo vehicular en vivo se activa cuando tu pantalla tiene el
            sensor de tráfico conectado.
          </div>
        </div>
        <div className="card">
          <div className="section-title">Resumen — últimos 7 días</div>
          <div className="kpi-grid">
            <div className="kpi-item">
              <div className="kpi-icon blue">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2">
                  <path d="M3 17l6-6 4 4 8-8" />
                </svg>
              </div>
              <div>
                <div className="kpi-label">Impactos totales</div>
                <div className="kpi-value">{TOTAL.toLocaleString("es-PE")}</div>
              </div>
            </div>
            <div className="kpi-item">
              <div className="kpi-icon orange">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 7v5l3 3" />
                </svg>
              </div>
              <div>
                <div className="kpi-label">Promedio diario</div>
                <div className="kpi-value">{PROMEDIO.toLocaleString("es-PE")}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="section-title">Conteo vehicular por día</div>
          <div className="impact-bars">
            {VEHICULOS.map((v, i) => (
              <div className="impact-bar-col" key={i}>
                <div className="impact-bar" style={{ height: `${(v / MAX_V) * 90}px` }} />
                <div className="impact-bar-label">{DIAS[i]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
