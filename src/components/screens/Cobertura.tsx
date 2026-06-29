import BackChevron from "../BackChevron";

interface Ciudad {
  nombre: string;
  pantallas: number;
}

const CIUDADES: Ciudad[] = [
  { nombre: "Lima", pantallas: 142 },
  { nombre: "Arequipa", pantallas: 38 },
  { nombre: "Trujillo", pantallas: 27 },
  { nombre: "Chiclayo", pantallas: 19 },
  { nombre: "Cusco", pantallas: 16 },
  { nombre: "Piura", pantallas: 14 },
];

const MAX = Math.max(...CIUDADES.map((c) => c.pantallas));
const TOTAL = CIUDADES.reduce((a, c) => a + c.pantallas, 0);

interface Props {
  onBack: () => void;
}

export default function Cobertura({ onBack }: Props) {
  return (
    <div>
      <div className="detail-header">
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Cobertura</div>
        <div style={{ width: 32 }} />
      </div>
      <div className="content-area">
        <div className="coverage-map-box">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="1.4">
            <path d="M12 21s-7-7.5-7-12a7 7 0 1 1 14 0c0 4.5-7 12-7 12z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 22, marginTop: 10 }}>
            {TOTAL.toLocaleString("es-PE")}+ pantallas
          </div>
          <div style={{ color: "rgba(255,255,255,.6)", fontSize: 12.5 }}>
            en {CIUDADES.length} ciudades del Perú
          </div>
        </div>
        <div className="card">
          <div className="section-title">Pantallas por ciudad</div>
          {CIUDADES.map((c, i) => (
            <div className="coverage-city-row" key={i}>
              <div className="coverage-dot" />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="coverage-city-name">{c.nombre}</span>
                  <span className="coverage-city-count">{c.pantallas}</span>
                </div>
                <div className="coverage-bar-track">
                  <div className="coverage-bar-fill" style={{ width: `${(c.pantallas / MAX) * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
