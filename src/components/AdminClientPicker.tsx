import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useClientesAdmin } from "../hooks/useClientesAdmin";
import { useSignedUrls } from "../hooks/useSignedUrls";
import { useAvatarPropio } from "../hooks/useAvatarPropio";
import { useSolicitudesCampana } from "../hooks/useSolicitudesCampana";
import { cloudFunctions, logout } from "../config/firebase";
import type { Cliente } from "../types";
import { brandColor } from "../utils/brandColor";
import { filtrarClientes } from "../utils/clientPicker";
import { ClientAvatar } from "./ClientAvatar";
import BrandLoader from "./BrandLoader";

interface Props {
  onSelect: (clienteId: string) => void;
  onOpenUsuarios?: () => void;
  onOpenSolicitudes?: () => void;
  onOpenAnalitica?: () => void;
  onOpenPerfil?: () => void;
  onOpenPaneles?: () => void;
  adminIniciales?: string;
  /** Para mostrar la foto real (no solo iniciales) en el ícono "Mi perfil". */
  uid?: string;
  vistaClienteActiva?: boolean;
  onToggleVistaCliente?: () => void;
}

/**
 * Selector de cuenta del admin — estilo "perfiles" (como Netflix):
 * tiles cuadrados con color + iniciales de marca, sobre un fondo
 * fotográfico. Grid responsivo: pocas columnas en móvil, más en
 * escritorio, siempre centrado y ocupando toda la pantalla.
 */
export default function AdminClientPicker({ onSelect, onOpenUsuarios, onOpenSolicitudes, onOpenAnalitica, onOpenPerfil, onOpenPaneles, adminIniciales, uid, vistaClienteActiva = false, onToggleVistaCliente }: Props) {
  const state = useClientesAdmin();
  const [busqueda, setBusqueda] = useState("");
  const [tab, setTab] = useState<"activos" | "archivados">("activos");
  const [menuCliente, setMenuCliente] = useState<Cliente | null>(null);
  const [accionandoId, setAccionandoId] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState("");
  const [avataresFallidos, setAvataresFallidos] = useState<Set<string>>(new Set());
  const [miAvatarFallo, setMiAvatarFallo] = useState(false);
  const [gestionAbierta, setGestionAbierta] = useState(false);
  const solicitudesState = useSolicitudesCampana(true);
  const solicitudesPendientes = solicitudesState.status === "ready"
    ? solicitudesState.solicitudes.filter((solicitud) => solicitud.estado === "Pendiente").length
    : 0;
  // Antes se mostraba la grilla al toque con íconos de color por
  // defecto y las fotos reales "aparecían" un instante después (viaje
  // al servidor para firmar las URLs de R2) — se veía como que la
  // pantalla cambiaba sola. Ahora se espera a tener clientes + fotos
  // firmadas ANTES de mostrar nada, con un tope de 4s para no dejar a
  // nadie trabado si la firma tarda o falla (en ese caso se muestra
  // igual, con íconos de respaldo donde falte foto).
  const [esperaMaxima, setEsperaMaxima] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setEsperaMaxima(true), 4000);
    return () => window.clearTimeout(t);
  }, []);

  const clientes: Cliente[] = state.status === "ready" ? state.clientes : [];
  const activos = clientes.filter((c) => !c.archived);
  const archivados = clientes.filter((c) => !!c.archived);
  const visibles = tab === "activos" ? activos : archivados;
  const filtrados = filtrarClientes(visibles, busqueda);

  // avatarUrl en realidad es una KEY de R2 (no una URL directa) para
  // los clientes migrados desde Cloudinary a R2 — hay que firmarla
  // antes de poder usarla en un <img>, igual que hace BrandThumb en el
  // resto de la app. Antes esta pantalla la usaba tal cual y por eso
  // salía como imagen rota.
  const miAvatarUrl = useAvatarPropio(uid);
  const miAvatarEsKeyR2 = Boolean(miAvatarUrl) && !miAvatarUrl.startsWith("http");
  // Se firma todo junto (fotos de clientes + la propia del admin) en
  // una sola tanda para no hacer dos viajes al servidor por separado.
  const keysR2 = clientes
    .map((c) => c.avatarUrl)
    .filter((url): url is string => Boolean(url) && !url!.startsWith("http"))
    .concat(miAvatarEsKeyR2 ? [miAvatarUrl] : []);
  const avataresFirmados = useSignedUrls(keysR2);

  function avatarSrc(c: Cliente) {
    if (!c.avatarUrl) return undefined;
    const url = c.avatarUrl.startsWith("http") ? c.avatarUrl : avataresFirmados[c.avatarUrl];
    if (!url || avataresFallidos.has(c.id)) return undefined;
    return url;
  }

  const miAvatarSrc = miAvatarUrl
    ? miAvatarUrl.startsWith("http")
      ? miAvatarUrl
      : avataresFirmados[miAvatarUrl]
    : undefined;

  const avataresPendientes = keysR2.some((k) => !(k in avataresFirmados));
  const todoListo = state.status !== "loading" && !avataresPendientes;

  async function llamarAdministrarCliente(clienteId: string, accion: "archivar" | "restaurar" | "eliminarDefinitivo") {
    if (!cloudFunctions) {
      throw new Error("Firebase Functions no está configurado.");
    }
    const fn = httpsCallable<{ clienteId: string; accion: string }, { ok: boolean }>(
      cloudFunctions,
      "administrarClienteAdmin"
    );
    await fn({ clienteId, accion });
  }

  async function archivarCliente(cliente: Cliente) {
    const seguro = window.confirm(`¿Seguro que quieres eliminar el perfil de ${cliente.empresa}? Primero se moverá a Archivados y podrás recuperarlo.`);
    if (!seguro) return;
    setAccionandoId(cliente.id);
    setErrorAccion("");
    try {
      await llamarAdministrarCliente(cliente.id, "archivar");
      setMenuCliente(null);
      setTab("archivados");
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : "No se pudo archivar el perfil.");
    } finally {
      setAccionandoId(null);
    }
  }

  async function restaurarCliente(cliente: Cliente) {
    setAccionandoId(cliente.id);
    setErrorAccion("");
    try {
      await llamarAdministrarCliente(cliente.id, "restaurar");
      setMenuCliente(null);
      setTab("activos");
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : "No se pudo recuperar el perfil.");
    } finally {
      setAccionandoId(null);
    }
  }

  async function eliminarDefinitivo(cliente: Cliente) {
    const seguro = window.confirm(`¿Eliminar definitivamente ${cliente.empresa}? Esto borrará el perfil y sus accesos de la base de datos. No se puede deshacer.`);
    if (!seguro) return;
    setAccionandoId(cliente.id);
    setErrorAccion("");
    try {
      await llamarAdministrarCliente(cliente.id, "eliminarDefinitivo");
      setMenuCliente(null);
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : "No se pudo eliminar definitivamente.");
    } finally {
      setAccionandoId(null);
    }
  }

  if (!todoListo && !esperaMaxima) {
    return <BrandLoader dark />;
  }

  return (
    <div className="admin-picker-shell">
      <button
        type="button"
        className="admin-picker-management-btn"
        onClick={() => setGestionAbierta(true)}
        aria-label="Abrir centro de gestión"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <path d="M8 9h8M8 13h5" />
        </svg>
        <span>Gestión</span>
        {solicitudesPendientes > 0 && <b>{solicitudesPendientes > 9 ? "9+" : solicitudesPendientes}</b>}
      </button>
      {onToggleVistaCliente && (
        <button
          type="button"
          className={`admin-picker-client-view-btn${vistaClienteActiva ? " active" : ""}`}
          onClick={onToggleVistaCliente}
          aria-pressed={vistaClienteActiva}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
            <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
            <circle cx="12" cy="12" r="2.7" />
          </svg>
          <span>Vista cliente</span>
        </button>
      )}
      {onOpenPerfil && (
        <button type="button" className="admin-picker-perfil-btn" onClick={onOpenPerfil} title="Mi perfil" aria-label="Mi perfil">
          {miAvatarSrc && !miAvatarFallo ? (
            <img src={miAvatarSrc} alt="" onError={() => setMiAvatarFallo(true)} />
          ) : (
            <span>{adminIniciales || "A"}</span>
          )}
        </button>
      )}
      <div className="admin-picker-header">
        <img src="/logo-player.png" alt="Vista360 Player" className="admin-picker-logo" draggable={false} />
        <div className="admin-picker-badge">
          <span className="admin-picker-badge-dot" />
          Modo Administrador
        </div>
        <div className="admin-picker-title">¿Qué cuenta gestionas?</div>
        <div className="admin-picker-sub">
          {vistaClienteActiva ? "Selecciona el cliente que deseas previsualizar." : "Selecciona un perfil de cliente para continuar."}
        </div>

        <div className="admin-picker-actions">
          <button type="button" onClick={onOpenUsuarios} className="admin-picker-action">
            <span className="admin-picker-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg></span>
            <span><strong>Usuarios</strong><small>Gestionar accesos</small></span>
          </button>
          <button type="button" onClick={onOpenSolicitudes} className="admin-picker-action">
            <span className="admin-picker-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h5"/></svg></span>
            <span><strong>Solicitudes</strong><small>Revisar campañas</small></span>
          </button>
          <button type="button" onClick={onOpenAnalitica} className="admin-picker-action">
            <span className="admin-picker-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg></span>
            <span><strong>Analítica</strong><small>Actividad y accesos</small></span>
          </button>
          <button type="button" onClick={onOpenPaneles} className="admin-picker-action">
            <span className="admin-picker-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 22h8M12 18v4"/></svg></span>
            <span><strong>Paneles</strong><small>Inventario digital</small></span>
          </button>
        </div>

        <div className="admin-picker-tabs" role="tablist" aria-label="Perfiles">
          <button type="button" className={tab === "activos" ? "active" : ""} onClick={() => setTab("activos")}>
            Activos <span>{activos.length}</span>
          </button>
          <button type="button" className={tab === "archivados" ? "active" : ""} onClick={() => setTab("archivados")}>
            Archivados <span>{archivados.length}</span>
          </button>
        </div>

        <div className="admin-picker-search-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" className="admin-picker-search-icon">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar empresa…"
            className="admin-picker-search"
          />
        </div>
      </div>

      <div className="admin-picker-body">
        {state.status === "loading" && (
          <div className="admin-picker-empty">Cargando clientes…</div>
        )}
        {state.status === "error" && (
          <div className="admin-picker-empty admin-picker-empty-error">{state.message}</div>
        )}
        {state.status === "ready" && filtrados.length === 0 && (
          <div className="admin-picker-empty">
            {tab === "activos" ? "No se encontró ningún cliente activo." : "No hay perfiles archivados."}
          </div>
        )}
        {errorAccion && <div className="admin-picker-empty admin-picker-empty-error">{errorAccion}</div>}

        <div className="admin-picker-grid">
          {filtrados.map((c) => {
            const { bg } = brandColor(c.empresa ?? "?");
            const busy = accionandoId === c.id;
            return (
              <div
                key={c.id}
                className={`admin-picker-tile ${c.archived ? "archived" : ""}`}
                onClick={() => !c.archived && !busy && onSelect(c.id)}
                onKeyDown={(event) => {
                  if ((event.key === "Enter" || event.key === " ") && !c.archived && !busy) {
                    event.preventDefault();
                    onSelect(c.id);
                  }
                }}
                role={!c.archived ? "button" : undefined}
                tabIndex={!c.archived && !busy ? 0 : undefined}
                aria-label={!c.archived ? `Entrar a la cuenta de ${c.empresa}` : undefined}
              >
                <div className="admin-picker-tile-avatar-wrap">
                  <button
                    type="button"
                    className="admin-picker-tile-main"
                    disabled={!!c.archived || busy}
                    tabIndex={-1}
                  >
                    <span className="admin-picker-tile-avatar" style={{ background: bg }}>
                      {avatarSrc(c) ? (
                        <img
                          src={avatarSrc(c)}
                          alt=""
                          onError={() => setAvataresFallidos((prev) => new Set(prev).add(c.id))}
                        />
                      ) : (
                        <ClientAvatar name={c.empresa ?? c.contacto ?? c.id} avatarKey={c.avatarKey} size={58} />
                      )}
                      <span className="admin-picker-tile-shine" aria-hidden="true" />
                    </span>
                  </button>
                  {tab === "activos" && (
                    <button
                      type="button"
                      className="admin-picker-tile-gear"
                      onClick={(event) => {
                        event.stopPropagation();
                        setMenuCliente(c);
                      }}
                      disabled={busy}
                      aria-label="Configuración"
                      title="Configuración"
                    >
                      <img src="/setting-2-svgrepo-com.svg" alt="" draggable={false} />
                    </button>
                  )}
                </div>
                <span className="admin-picker-tile-name">{c.empresa}</span>
                {tab === "activos" && <span className="admin-picker-tile-hint">Entrar a la cuenta <span>→</span></span>}
                {tab !== "activos" && (
                  <div className="admin-picker-archive-actions">
                    <button type="button" onClick={() => restaurarCliente(c)} disabled={busy} title="Recuperar perfil">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 7h18" /><path d="M5 7l2 13h10l2-13" /><path d="M9 7V4h6v3" /><path d="M9 14l3-3 3 3" /><path d="M12 11v6" />
                      </svg>
                    </button>
                    <button type="button" className="danger" onClick={() => eliminarDefinitivo(c)} disabled={busy} title="Eliminar definitivo">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v5" /><path d="M14 11v5" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {menuCliente && (
        <div className="admin-picker-modal-backdrop" onClick={() => setMenuCliente(null)}>
          <div className="admin-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-picker-modal-kicker">Configuración</div>
            <div className="admin-picker-modal-title">{menuCliente.empresa}</div>
            <div className="admin-picker-modal-copy">
              Al eliminar ahora se moverá a Archivados. Desde Archivados podrás recuperarlo o borrarlo definitivamente.
            </div>
            <button
              type="button"
              className="admin-picker-modal-action danger"
              onClick={() => archivarCliente(menuCliente)}
              disabled={accionandoId === menuCliente.id}
            >
              Eliminar perfil
            </button>
            <button type="button" className="admin-picker-modal-action secondary" onClick={() => setMenuCliente(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {gestionAbierta && (
        <div className="admin-picker-management-screen">
          <img src="/logo-player.png" alt="Vista360 Player" className="admin-picker-management-logo" draggable={false} />
          <div className="admin-picker-management-head">
            <button type="button" onClick={() => setGestionAbierta(false)} aria-label="Volver a clientes">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <div>
              <strong>Centro de gestión</strong>
              <span>Administra tu operación desde un solo lugar.</span>
            </div>
          </div>
          <div className="admin-picker-management-grid">
            <button type="button" onClick={onOpenUsuarios} className="admin-picker-management-card">
              <span className="admin-picker-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg></span>
              <span><strong>Usuarios</strong><small>Gestionar accesos</small></span>
              <i>›</i>
            </button>
            <button type="button" onClick={onOpenSolicitudes} className="admin-picker-management-card">
              <span className="admin-picker-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h5"/></svg></span>
              <span><strong>Solicitudes</strong><small>Revisar campañas</small></span>
              {solicitudesPendientes > 0 && <b>{solicitudesPendientes > 9 ? "9+" : solicitudesPendientes}</b>}
              <i>›</i>
            </button>
            <button type="button" onClick={onOpenAnalitica} className="admin-picker-management-card">
              <span className="admin-picker-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg></span>
              <span><strong>Analítica</strong><small>Actividad y accesos</small></span>
              <i>›</i>
            </button>
            <button type="button" onClick={onOpenPaneles} className="admin-picker-management-card">
              <span className="admin-picker-action-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 22h8M12 18v4"/></svg></span>
              <span><strong>Paneles</strong><small>Inventario digital</small></span>
              <i>›</i>
            </button>
          </div>
        </div>
      )}

      <div className="admin-picker-footer">
        <button onClick={() => logout()} className="admin-picker-logout">
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
