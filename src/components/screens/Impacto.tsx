import BackChevron from "../BackChevron";

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
        <div className="card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🚗</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
            Conteo vehicular en vivo — próximamente
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, maxWidth: 320, margin: "0 auto" }}>
            Esta sección se activa automáticamente cuando tu panel tiene un sensor de tráfico
            conectado. Aún no hay uno instalado en tus campañas activas — cuando lo tengas, vas a
            ver aquí el impacto real, no un ejemplo.
          </div>
        </div>
      </div>
    </div>
  );
}
