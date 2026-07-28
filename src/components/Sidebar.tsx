import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  IconInicio, IconCobertura, IconMisPantallas, IconReportes,
  IconFacturas, IconAnalitica, IconCerrar, IconCambiarCliente, IconCerrarSesion,
} from "./SidebarIcons";
import { BrandThumb } from "./BrandThumb";

type SidebarView =
  | "inicio"
  | "campanas"
  | "cobertura"
  | "mispantallas"
  | "reportes"
  | "facturas"
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
  /** true para Gerente, false para Trabajador -- solo cambia la
   *  etiqueta de rol que se muestra en la tarjeta de perfil móvil. */
  esGerente?: boolean;
  solicitudesPendientes?: number;
  /** Vista actual de la app — solo se usa para resaltar el ítem activo
   *  y deslizar el pill de vidrio en el sidebar de escritorio. */
  active?: string;
  /** Nombre a mostrar en el chip de perfil del header del sidebar --
   *  el de la empresa (cliente) o el del admin, según quién haya
   *  entrado. Ver comentario junto al chip más abajo. */
  perfilNombre?: string;
  perfilAvatarKey?: string;
  perfilAvatarUrl?: string;
  /** Se dispara al tocar el chip de perfil. Sin esto, el chip igual se
   *  ve pero no hace nada -- así el sidebar no rompe si algún llamador
   *  todavía no lo conecta. */
  onOpenPerfil?: () => void;
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

export default function Sidebar({ open, onClose, onNavigate, onLogout, onCambiarCliente, isAdmin, esGerente = true, solicitudesPendientes, active, perfilNombre, perfilAvatarKey, perfilAvatarUrl, onOpenPerfil }: Props) {
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
          {/* Antes acá iba el logo genérico de Vista360 Player, igual
              para cualquier cuenta. Se pidió que en su lugar (tanto en
              el sidebar móvil como en el de escritorio -- este bloque
              ya estaba pensado para verse igual en los dos, ver
              comentario de ".sidebar-head" en app.css) se vea el
              perfil de la cuenta: foto/ícono + nombre, tocable para ir
              a Perfil. Mismo componente BrandThumb que ya se usa en
              Accesos y el selector de clientes, para que se sienta
              consistente con el resto de la app. */}
          <button
            type="button"
            onClick={onOpenPerfil}
            className="sidebar-profile-chip sidebar-profile-chip-expanded"
            aria-label="Ver perfil"
          >
            <span className="sidebar-profile-avatar-default">
              <BrandThumb
                name={perfilNombre || "?"}
                avatarKey={perfilAvatarKey}
                avatarUrl={perfilAvatarUrl}
                size={34}
                radius={10}
                iconScale={0.6}
              />
            </span>
            <span className="sidebar-profile-avatar-mobile">
              <BrandThumb
                name={perfilNombre || "Perfil"}
                avatarKey={perfilAvatarKey}
                avatarUrl={perfilAvatarUrl}
                size={62}
                radius={18}
                iconScale={0.58}
              />
            </span>
            <span className="sidebar-profile-chip-copy">
              <span className="sidebar-profile-chip-name">{perfilNombre || "Perfil"}</span>
              <span className="sidebar-profile-chip-details">
                <span><i aria-hidden="true" />{isAdmin ? (esGerente ? "Gerente" : "Trabajador") : "Cliente"}</span>
                <small>{isAdmin ? "Ver mi perfil" : "Ver perfil del cliente"}</small>
              </span>
            </span>
          </button>
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
                  background: "#EF4444", color: "#fff", fontSize: 11, fontWeight: 700,
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
