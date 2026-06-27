import type { Contrato, Panel } from "../../types";
import { estadoCampana } from "../../types";

interface Props {
  contrato: Contrato;
  panel: Panel | undefined;
  onBack: () => void;
}

export default function DetalleCampana({ contrato, panel, onBack }: Props) {
  const estado = estadoCampana(contrato);
  const numEvidencias = contrato.fotos_campania?.length ?? 0;

  return (
    <div>
      <div className="detail-header" style={{ background: "#fff" }}>
        <div className="back-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </div>
        <div className="header-title" style={{ fontSize: 16 }}>Detalle de campaña</div>
        <div style={{ width: 20 }} />
      </div>

      <div className="campaign-hero">
        <div className="hero-thumb" style={{ width: 64, height: 64, borderRadius: 12, background: "#0D1629", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 22, flexShrink: 0 }}>
          {panel?.icono ?? "🏙️"}
        </div>
        <div className="hero-info">
          <div className="hero-name">Contrato #{contrato.id.slice(0, 6)}</div>
          <div className={`badge ${estado.toLowerCase()}`} style={{ marginBottom: 8 }}>
            {estado}
          </div>
          <div className="hero-meta">📅 {contrato.inicio} – {contrato.fin}</div>
          <div className="hero-meta">📍 {panel?.nombre ?? contrato.panel_id} {panel?.ciudad ? `· ${panel.ciudad}` : ""}</div>
        </div>
      </div>

      <div className="detail-content">
        <div className="section-title">Estado general</div>
        <div className="status-card" style={{ marginBottom: 14 }}>
          <div className="status-icon-big">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <div>
            <div className="status-main-text">
              {estado === "Activa" ? "Todo funcionando" : estado === "Programada" ? "Por iniciar" : "Campaña finalizada"}
            </div>
            <div className="status-sub-text">Sin incidencias reportadas</div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <div className="section-title">Información del contrato</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "#374151" }}>
            <div>Monto: <strong>S/ {contrato.monto?.toLocaleString("es-PE") ?? "—"}</strong></div>
            <div>Pago: <strong>{contrato.pagado ? "Al día" : "Pendiente"}</strong></div>
            <div>Cara del panel: <strong>{contrato.cara ?? "Ambas / Mural"}</strong></div>
            <div>Evidencias recibidas: <strong>{numEvidencias}</strong></div>
          </div>
        </div>

        {panel?.direccion && (
          <div className="card">
            <div className="section-title">Ubicación del panel</div>
            <div style={{ fontSize: 13, color: "#374151" }}>{panel.direccion}</div>
          </div>
        )}
      </div>
    </div>
  );
}
