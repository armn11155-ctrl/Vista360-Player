import BackChevron from "../BackChevron";
import type { Cliente } from "../../types";

interface Props {
  cliente: Cliente | null;
  onBack: () => void;
}

export default function Contactanos({ cliente, onBack }: Props) {
  return (
    <div className="contact-screen">
      <div className="detail-header">
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Contáctanos</div>
        <div style={{ width: 32 }} />
      </div>
      <div className="content-area contact-area">
        <div className="contact-card">
          <div className="section-title">Tu ejecutivo de cuenta</div>
          <div className="contact-name">
            {cliente?.ejecutivo ?? "Equipo Vista360"}
          </div>
          <div className="contact-copy">
            Te ayuda con cotizaciones, renovaciones y soporte de tus campañas.
          </div>
        </div>

        <div className="contact-card">
          <div className="section-title">Canales de contacto</div>
          <a className="contact-btn" href="https://wa.me/51999999999" target="_blank" rel="noreferrer">
            <div className="contact-btn-icon">WA</div>
            <div>
              <div className="contact-btn-title">WhatsApp</div>
              <div className="contact-btn-sub">+51 999 999 999</div>
            </div>
          </a>
          <a className="contact-btn" href="tel:+5115550199">
            <div className="contact-btn-icon">TL</div>
            <div>
              <div className="contact-btn-title">Llamar</div>
              <div className="contact-btn-sub">(01) 555 0199</div>
            </div>
          </a>
          <a className="contact-btn" href="mailto:contacto@vista360.pe">
            <div className="contact-btn-icon">EM</div>
            <div>
              <div className="contact-btn-title">Correo</div>
              <div className="contact-btn-sub">contacto@vista360.pe</div>
            </div>
          </a>
        </div>

        <div className="contact-card">
          <div className="section-title">Horario de atención</div>
          <div className="contact-copy strong">
            Lunes a viernes: 9:00 am – 6:30 pm
            <br />
            Sábados: 9:00 am – 1:00 pm
          </div>
        </div>
      </div>
    </div>
  );
}
