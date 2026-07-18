import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useClientesAdmin } from "../hooks/useClientesAdmin";
import { useSignedUrls } from "../hooks/useSignedUrls";
import { cloudFunctions, logout } from "../config/firebase";
import type { Cliente } from "../types";
import { brandColor } from "../utils/brandColor";
import { filtrarClientes } from "../utils/clientPicker";
import { ClientAvatar } from "./ClientAvatar";

interface Props {
  onSelect: (clienteId: string) => void;
  onOpenUsuarios?: () => void;
  onOpenSolicitudes?: () => void;
  onOpenAnalitica?: () => void;
  onOpenPerfil?: () => void;
  adminIniciales?: string;
}

/**
 * Selector de cuenta del admin — estilo "perfiles" (como Netflix):
 * tiles cuadrados con color + iniciales de marca, sobre un fondo
 * fotográfico. Grid responsivo: pocas columnas en móvil, más en
 * escritorio, siempre centrado y ocupando toda la pantalla.
 */
export default function AdminClientPicker({ onSelect, onOpenUsuarios, onOpenSolicitudes, onOpenAnalitica, onOpenPerfil, adminIniciales }: Props) {
  const state = useClientesAdmin();
  const [busqueda, setBusqueda] = useState("");
  const [tab, setTab] = useState<"activos" | "archivados">("activos");
  const [menuCliente, setMenuCliente] = useState<Cliente | null>(null);
  const [accionandoId, setAccionandoId] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState("");
  const [avataresFallidos, setAvataresFallidos] = useState<Set<string>>(new Set());

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
  const keysR2 = clientes
    .map((c) => c.avatarUrl)
    .filter((url): url is string => Boolean(url) && !url!.startsWith("http"));
  const avataresFirmados = useSignedUrls(keysR2);

  function avatarSrc(c: Cliente) {
    if (!c.avatarUrl) return undefined;
    const url = c.avatarUrl.startsWith("http") ? c.avatarUrl : avataresFirmados[c.avatarUrl];
    if (!url || avataresFallidos.has(c.id)) return undefined;
    return url;
  }

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

  return (
    <div className="admin-picker-shell">
      {onOpenPerfil && (
        <button type="button" className="admin-picker-perfil-btn" onClick={onOpenPerfil} title="Mi perfil" aria-label="Mi perfil">
          {adminIniciales || "A"}
        </button>
      )}
      <div className="admin-picker-header">
        <img src="/logo-player.png" alt="Vista360 Player" className="admin-picker-logo" draggable={false} />
        <div className="admin-picker-badge">
          <span className="admin-picker-badge-dot" />
          Modo Administrador
        </div>
        <div className="admin-picker-title">¿Qué cuenta gestionas?</div>
        <div className="admin-picker-sub">Selecciona un perfil de cliente para continuar.</div>

        <div className="admin-picker-actions">
          <button type="button" onClick={onOpenUsuarios} className="admin-picker-action">
            Usuarios
          </button>
          <button type="button" onClick={onOpenSolicitudes} className="admin-picker-action">
            Solicitudes de campaña
          </button>
          <button type="button" onClick={onOpenAnalitica} className="admin-picker-action">
            Analítica de accesos
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
              >
                <button
                  type="button"
                  className="admin-picker-tile-main"
                  onClick={() => !c.archived && onSelect(c.id)}
                  disabled={!!c.archived || busy}
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
                </span>
                <span className="admin-picker-tile-name">{c.empresa}</span>
                </button>
                {tab === "activos" ? (
                  <button
                    type="button"
                    className="admin-picker-tile-config"
                    onClick={() => setMenuCliente(c)}
                    disabled={busy}
                  >
                    Configuración
                  </button>
                ) : (
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

      <div className="admin-picker-footer">
        <button onClick={() => logout()} className="admin-picker-logout">
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
