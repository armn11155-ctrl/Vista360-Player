import BackChevron from "./BackChevron";
import MobileSidebarButton from "./MobileSidebarButton";

interface Props {
  title: string;
  onMenuClick?: () => void;
  onBack?: () => void;
  onNotifClick?: () => void;
  totalNotifs?: number;
  className?: string;
}

/**
 * Encabezado compartido de las pantallas principales del cliente.
 * Las columnas laterales tienen exactamente el mismo ancho para que el
 * título permanezca centrado respecto a la pantalla, no respecto al espacio
 * sobrante entre los botones.
 */
export default function ClientScreenHeader({
  title,
  onMenuClick,
  onBack,
  onNotifClick,
  totalNotifs = 0,
  className = "",
}: Props) {
  const pendientes = Math.max(0, totalNotifs);

  return (
    <header className={`client-screen-header ${className}`.trim()}>
      <div className="client-screen-header-side client-screen-header-left">
        <MobileSidebarButton onClick={onMenuClick} />
        {onBack && (
          <button type="button" className="back-btn client-screen-back" onClick={onBack} aria-label="Volver">
            <BackChevron />
          </button>
        )}
      </div>

      <h1 className="client-screen-header-title">{title}</h1>

      <div className="client-screen-header-side client-screen-header-right">
        <button
          type="button"
          className="client-screen-notification-btn"
          onClick={onNotifClick}
          aria-label={pendientes > 0 ? `Notificaciones, ${pendientes} pendientes` : "Notificaciones"}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {pendientes > 0 && <span>{pendientes > 9 ? "9+" : pendientes}</span>}
        </button>
      </div>
    </header>
  );
}
