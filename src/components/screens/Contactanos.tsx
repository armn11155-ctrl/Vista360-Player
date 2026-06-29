import BackChevron from "../BackChevron";
import type { Cliente } from "../../types";

interface Props {
  cliente: Cliente | null;
  onBack: () => void;
}

export default function Contactanos({ cliente, onBack }: Props) {
  return (
    <div>
      <div className="detail-header">
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Contáctanos</div>
        <div style={{ width: 32 }} />
      </div>
      <div className="content-area">
        <div className="card">
          <div className="section-title">Tu ejecutivo de cuenta</div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: "#111827" }}>
            {cliente?.ejecutivo ?? "Equipo Vista360"}
          </div>
          <div style={{ fontSize: 12.5, color: "#6B7280", marginTop: 3, lineHeight: 1.5 }}>
            Te ayuda con cotizaciones, renovaciones y soporte de tus campañas.
          </div>
        </div>

        <div className="card">
          <div className="section-title">Canales de contacto</div>
          <a className="contact-btn" style={{ background: "#F0FDF4" }} href="https://wa.me/51999999999" target="_blank" rel="noreferrer">
            <div className="contact-btn-icon" style={{ background: "#22C55E" }}>💬</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: "#111827" }}>WhatsApp</div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>+51 999 999 999</div>
            </div>
          </a>
          <a className="contact-btn" style={{ background: "#EFF6FF" }} href="tel:+5115550199">
            <div className="contact-btn-icon" style={{ background: "#2563EB" }}>📞</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: "#111827" }}>Llamar</div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>(01) 555 0199</div>
            </div>
          </a>
          <a className="contact-btn" style={{ background: "#FFF7ED" }} href="mailto:contacto@vista360.pe">
            <div className="contact-btn-icon" style={{ background: "#D97706" }}>✉️</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: "#111827" }}>Correo</div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>contacto@vista360.pe</div>
            </div>
          </a>
        </div>

        <div className="card">
          <div className="section-title">Horario de atención</div>
          <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.7 }}>
            Lunes a viernes: 9:00 am – 6:30 pm
            <br />
            Sábados: 9:00 am – 1:00 pm
          </div>
        </div>
      </div>
    </div>
  );
}
