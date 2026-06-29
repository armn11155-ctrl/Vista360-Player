type SidebarView =
  | "inicio"
  | "portafolio"
  | "cobertura"
  | "mispantallas"
  | "reportes"
  | "impacto"
  | "contactanos";

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: SidebarView) => void;
  onLogout: () => void;
}

const ITEMS: { id: SidebarView; icon: string; label: string }[] = [
  { id: "inicio", icon: "🏠", label: "Inicio" },
  { id: "portafolio", icon: "🗂️", label: "Portafolio" },
  { id: "cobertura", icon: "🗺️", label: "Cobertura" },
  { id: "mispantallas", icon: "📺", label: "Mis Pantallas" },
  { id: "reportes", icon: "📊", label: "Reportes" },
  { id: "impacto", icon: "🚗", label: "Impacto" },
  { id: "contactanos", icon: "💬", label: "Contáctanos" },
];

export default function Sidebar({ open, onClose, onNavigate, onLogout }: Props) {
  return (
    <>
      <div className={`sidebar-overlay ${open ? "open" : ""}`} onClick={onClose} />
      <div className={`sidebar-panel ${open ? "open" : ""}`}>
        <div className="sidebar-head">
          <img src="/logo-player.png" alt="Vista360 Player" />
          <div className="sidebar-close" onClick={onClose}>
            ✕
          </div>
        </div>
        <div className="sidebar-list">
          {ITEMS.map((it) => (
            <div
              key={it.id}
              className="sidebar-item"
              onClick={() => {
                onNavigate(it.id);
                onClose();
              }}
            >
              <span className="sidebar-item-icon">{it.icon}</span>
              <span className="sidebar-item-label">{it.label}</span>
              <span className="sidebar-item-chevron">›</span>
            </div>
          ))}
          <div
            className="sidebar-item sidebar-item-danger"
            onClick={() => {
              onLogout();
              onClose();
            }}
          >
            <span className="sidebar-item-icon">🚪</span>
            <span className="sidebar-item-label">Cerrar Sesión</span>
          </div>
        </div>
      </div>
    </>
  );
}
