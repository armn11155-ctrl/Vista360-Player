import type { ReactNode } from "react";
import {
  IconInicio, IconCobertura, IconMisPantallas, IconReportes,
  IconFacturas, IconAnalitica, IconCerrar,
} from "./SidebarIcons";

type SidebarView =
  | "inicio"
  | "portafolio"
  | "cobertura"
  | "mispantallas"
  | "reportes"
  | "facturas"
  | "contactanos"
  | "analitica"
  | "solicitudes"
  | "accesos";

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: SidebarView) => void;
  onLogout: () => void;
  onCambiarCliente?: () => void;
  isAdmin?: boolean;
  solicitudesPendientes?: number;
}

const ITEMS: { id: SidebarView; icon: ReactNode; label: string; adminOnly?: boolean }[] = [
  { id: "inicio",       icon: <IconInicio />,       label: "Inicio" },
  { id: "cobertura",    icon: <IconCobertura />,    label: "Cobertura" },
  { id: "mispantallas", icon: <IconMisPantallas />, label: "Mis Publicidades" },
  { id: "reportes",     icon: <IconReportes />,     label: "Reportes" },
  { id: "facturas",     icon: <IconFacturas />,     label: "Facturas" },
  { id: "analitica",    icon: <IconAnalitica />,    label: "Analítica de acceso", adminOnly: true },
];

export default function Sidebar({ open, onClose, onNavigate, onLogout, onCambiarCliente, isAdmin, solicitudesPendientes }: Props) {
  const items = ITEMS.filter((it) => !it.adminOnly || isAdmin);
  return (
    <>
      <div className={`sidebar-overlay ${open ? "open" : ""}`} onClick={onClose} />
      <div className={`sidebar-panel ${open ? "open" : ""}`}>
        <div className="sidebar-head">
          <img src="/logo-player.png" alt="Vista360 Player" />
          <div className="sidebar-close" onClick={onClose}>
            <IconCerrar size={13} />
          </div>
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
              {it.id === "solicitudes" && !!solicitudesPendientes && (
                <span style={{
                  background: "#EF4444", color: "#fff", fontSize: 10.5, fontWeight: 700,
                  borderRadius: 20, padding: "1px 7px", marginRight: 4,
                }}>
                  {solicitudesPendientes}
                </span>
              )}
              <span className="sidebar-item-chevron">›</span>
            </div>
          ))}
          {isAdmin && onCambiarCliente && (
            <div
              className="sidebar-item"
              onClick={() => { onCambiarCliente(); onClose(); }}
            >
              <span className="sidebar-item-icon">⇄</span>
              <span className="sidebar-item-label">Cambiar cliente</span>
              <span className="sidebar-item-chevron">›</span>
            </div>
          )}
          <div
            className="sidebar-item sidebar-item-danger"
            onClick={() => { onLogout(); onClose(); }}
          >
            <span className="sidebar-item-icon">🚪</span>
            <span className="sidebar-item-label">Cerrar Sesión</span>
          </div>
        </div>
      </div>
    </>
  );
}
