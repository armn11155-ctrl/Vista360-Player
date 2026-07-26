import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  IconInicio, IconCobertura, IconMisPantallas, IconReportes,
  IconFacturas, IconAnalitica, IconCerrar, IconCambiarCliente, IconCerrarSesion,
} from "./SidebarIcons";

type SidebarView =
  | "inicio"
  | "campanas"
  | "portafolio"
  | "cobertura"
  | "mispantallas"
  | "reportes"
  | "facturas"
  | "contactanos"
  | "analitica"
  | "solicitudes"
  | "accesos"
  | "paneles";

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: SidebarView) => void;
  onLogout: () => void;
  onCambiarCliente?: () => void;
  isAdmin?: boolean;
  solicitudesPendientes?: number;
  /** Vista actual de la app — solo se usa para resaltar el ítem activo
   *  y deslizar el pill de vidrio en el sidebar de escritorio. */
  active?: string;
}

const ITEMS: {
  id: SidebarView;
  icon: ReactNode;
  label: string;
  adminOnly?: boolean;
  desktopOnly?: boolean;
  mobileOnly?: boolean;
}[] = [
  { id: "inicio",       icon: <IconInicio />,       label: "Inicio" },
  // Antes en movil este mismo lugar decia "Mis Publicidades" (id
  // "mispantallas", pantalla distinta) -- a pedido del cliente ahora
  // dice "Campañas" en los dos, escritorio y movil, sin distincion.
  { id: "campanas",     icon: <IconMisPantallas />, label: "Campañas" },
  { id: "cobertura",    icon: <IconCobertura />,    label: "Cobertura" },
  { id: "reportes",     icon: <IconReportes />,     label: "Reportes" },
  { id: "facturas",     icon: <IconFacturas />,     label: "Facturas" },
  { id: "analitica",    icon: <IconAnalitica />,    label: "Analítica de acceso", adminOnly: true, mobileOnly: true },
  // Paneles NO va en este menú -- solo se abre desde el selector de
  // cliente del admin (AdminClientPicker), a pedido explícito.
];

export default function Sidebar({ open, onClose, onNavigate, onLogout, onCambiarCliente, isAdmin, solicitudesPendientes, active }: Props) {
  const items = ITEMS.filter((it) => !it.adminOnly || isAdmin);

  // ── Pill de vidrio deslizante (solo escritorio — ver .sidebar-pill en app.css) ──
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [pill, setPill] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [pillReady, setPillReady] = useState(false);

  useLayoutEffect(() => {
    function medir() {
      const activeIdx = items.findIndex((it) => it.id === active);
      const list = listRef.current;
      const el = activeIdx === -1 ? null : itemRefs.current[activeIdx];
      if (!list || !el) { setPill(null); return; }
      const eRect = el.getBoundingClientRect();
      // El ítem activo está oculto (display:none) en este breakpoint —
      // p.ej. un ítem "mobileOnly" mientras estamos en escritorio.
      if (eRect.width === 0 || eRect.height === 0) { setPill(null); return; }
      const lRect = list.getBoundingClientRect();
      setPill({
        top: eRect.top - lRect.top,
        left: eRect.left - lRect.left,
        width: eRect.width,
        height: eRect.height,
      });
      requestAnimationFrame(() => setPillReady(true));
    }
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, items.length, isAdmin]);

  return (
    <>
      <div className={`sidebar-overlay ${open ? "open" : ""}`} onClick={onClose} />
      <div className={`sidebar-panel ${open ? "open" : ""}`}>
        <div className="sidebar-head">
          <img src="/logo-sidebar-player.png" alt="Vista360 Player" className="sidebar-logo-img" />
          <div className="sidebar-close" onClick={onClose}>
            <IconCerrar size={13} />
          </div>
        </div>
        <div className="sidebar-list" ref={listRef}>
          {pill && (
            <div
              className="sidebar-pill"
              style={{
                top: pill.top,
                left: pill.left,
                width: pill.width,
                height: pill.height,
                transition: pillReady
                  ? "top 0.38s cubic-bezier(0.34,1.4,0.64,1), left 0.38s cubic-bezier(0.34,1.4,0.64,1)"
                  : "none",
              }}
            />
          )}
          {items.map((it, idx) => (
            <div
              key={it.id}
              data-sidebar-id={it.id}
              ref={(el) => { itemRefs.current[idx] = el; }}
              className={[
                "sidebar-item",
                it.id === active ? "sidebar-item-active" : "",
                it.desktopOnly ? "sidebar-item-desktop-only" : "",
                it.mobileOnly ? "sidebar-item-mobile-only" : "",
              ].filter(Boolean).join(" ")}
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
          <div className="sidebar-bottom">
            {onCambiarCliente && (
              <div className="sidebar-bottom-section sidebar-bottom-section-switch">
                <div
                  className="sidebar-item sidebar-item-switch"
                  onClick={() => { onCambiarCliente(); onClose(); }}
                >
                  <span className="sidebar-item-icon"><IconCambiarCliente /></span>
                  <span className="sidebar-item-label">Cambiar cliente</span>
                  <span className="sidebar-item-chevron">›</span>
                </div>
              </div>
            )}
            <div className="sidebar-bottom-section sidebar-bottom-section-logout">
              <div
                className="sidebar-item sidebar-item-danger"
                onClick={() => { onLogout(); onClose(); }}
              >
                <span className="sidebar-item-icon"><IconCerrarSesion /></span>
                <span className="sidebar-item-label">Cerrar Sesión</span>
                <span className="sidebar-item-chevron">›</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
