type SidebarView =
  | "inicio"
  | "portafolio"
  | "cobertura"
  | "mispantallas"
  | "reportes"
  | "impacto"
  | "contactanos"
  | "analitica";

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: SidebarView) => void;
  onLogout: () => void;
  isAdmin?: boolean;
}

const ITEMS: { id: SidebarView; icon: string; label: string; adminOnly?: boolean }[] = [
  { id: "inicio",       icon: "🏠",  label: "Inicio" },
  { id: "portafolio",   icon: "🗂️",  label: "Portafolio" },
  { id: "cobertura",    icon: "🗺️",  label: "Cobertura" },
  { id: "mispantallas", icon: "📺",  label: "Mis Pantallas" },
  { id: "reportes",     icon: "📊",  label: "Reportes" },
  { id: "impacto",      icon: "🚗",  label: "Impacto" },
  { id: "contactanos",  icon: "💬",  label: "Contáctanos" },
  { id: "analitica",    icon: "📈",  label: "Analítica de acceso", adminOnly: true },
];

export default function Sidebar({ open, onClose, onNavigate, onLogout, isAdmin }: Props) {
  const items = ITEMS.filter((it) => !it.adminOnly || isAdmin);
  return (
    <>
      <div className={`sidebar-overlay ${open ? "open" : ""}`} onClick={onClose} />
      <div className={`sidebar-panel ${open ? "open" : ""}`}>
        <div className="sidebar-head">
          <img src="/logo-player.png" alt="Vista360 Player" />
          <div className="sidebar-close" onClick={onClose}>✕</div>
        </div>
        <div className="sidebar-list">
          {items.map((it) => (
            <div
              key={it.id}
              className="sidebar-item"
              onClick={() => { onNavigate(it.id); onClose(); }}
            >
              <span className="sidebar-item-icon">{it.icon}</span>
              <span className="sidebar-item-label">{it.label}</span>
              <span className="sidebar-item-chevron">›</span>
            </div>
          ))}
          <div
            className="sidebar-item sidebar-item-danger"
            onClick={() => { onLogout(); onClose(); }}
          >
            <span className="sidebar-item-icon">🚪</span>
            <span className="sidebar-item-label">Cerrar Sesión</span>
          </div>
        </div>

        {/* Debug temporal — te muestra si isAdmin llegó como true o false */}
        <div style={{ padding: "8px 20px", fontSize: 11, color: "#6B7A99", opacity: 0.6 }}>
          rol: {isAdmin ? "admin ✓" : "cliente"}
        </div>
      </div>
    </>
  );
}
