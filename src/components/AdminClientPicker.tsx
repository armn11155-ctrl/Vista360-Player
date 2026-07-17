import { useEffect, useState } from "react";
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch, type Query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useClientesAdmin } from "../hooks/useClientesAdmin";
import { db, cloudFunctions, logout } from "../config/firebase";
import type { Cliente } from "../types";
import { brandColor } from "../utils/brandColor";
import { filtrarClientes } from "../utils/clientPicker";
import { ClientAvatar } from "./ClientAvatar";

function formatoEspacio(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Espacio total usado en R2 (todos los clientes juntos) — solo el admin lo ve. */
function useEspacioR2() {
  const [estado, setEstado] = useState<{ status: "loading" | "ready" | "error"; bytes?: number }>({ status: "loading" });

  useEffect(() => {
    if (!cloudFunctions) {
      setEstado({ status: "error" });
      return;
    }
    let cancelado = false;
    const fn = httpsCallable<Record<string, never>, { totalBytes: number; totalObjetos: number }>(
      cloudFunctions,
      "obtenerEspacioR2"
    );
    fn()
      .then(({ data }) => {
        if (!cancelado) setEstado({ status: "ready", bytes: data.totalBytes });
      })
      .catch(() => {
        if (!cancelado) setEstado({ status: "error" });
      });
    return () => {
      cancelado = true;
    };
  }, []);

  return estado;
}

interface Props {
  onSelect: (clienteId: string) => void;
  onOpenUsuarios?: () => void;
  onOpenSolicitudes?: () => void;
  onOpenAnalitica?: () => void;
}

/**
 * Selector de cuenta del admin — estilo "perfiles" (como Netflix):
 * tiles cuadrados con color + iniciales de marca, sobre un fondo
 * fotográfico. Grid responsivo: pocas columnas en móvil, más en
 * escritorio, siempre centrado y ocupando toda la pantalla.
 */
export default function AdminClientPicker({ onSelect, onOpenUsuarios, onOpenSolicitudes, onOpenAnalitica }: Props) {
  const state = useClientesAdmin();
  const espacio = useEspacioR2();
  const [busqueda, setBusqueda] = useState("");
  const [tab, setTab] = useState<"activos" | "archivados">("activos");
  const [menuCliente, setMenuCliente] = useState<Cliente | null>(null);
  const [accionandoId, setAccionandoId] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState("");

  const clientes: Cliente[] = state.status === "ready" ? state.clientes : [];
  const activos = clientes.filter((c) => !c.archived);
  const archivados = clientes.filter((c) => !!c.archived);
  const visibles = tab === "activos" ? activos : archivados;
  const filtrados = filtrarClientes(visibles, busqueda);

  async function archivarCliente(cliente: Cliente) {
    if (!db) {
      setErrorAccion("Firebase no está configurado.");
      return;
    }
    const seguro = window.confirm(`¿Seguro que quieres eliminar el perfil de ${cliente.empresa}? Primero se moverá a Archivados y podrás recuperarlo.`);
    if (!seguro) return;
    setAccionandoId(cliente.id);
    setErrorAccion("");
    try {
      await updateDoc(doc(db, "clientes", cliente.id), {
        archived: true,
        archivedAt: serverTimestamp(),
      });
      setMenuCliente(null);
      setTab("archivados");
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : "No se pudo archivar el perfil.");
    } finally {
      setAccionandoId(null);
    }
  }

  async function restaurarCliente(cliente: Cliente) {
    if (!db) {
      setErrorAccion("Firebase no está configurado.");
      return;
    }
    setAccionandoId(cliente.id);
    setErrorAccion("");
    try {
      await updateDoc(doc(db, "clientes", cliente.id), {
        archived: false,
        archivedAt: null,
      });
      setMenuCliente(null);
      setTab("activos");
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : "No se pudo recuperar el perfil.");
    } finally {
      setAccionandoId(null);
    }
  }

  async function borrarQuery(q: Query) {
    if (!db) return;
    const snap = await getDocs(q);
    let batch = writeBatch(db);
    let count = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      count += 1;
      if (count === 450) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) await batch.commit();
  }

  async function eliminarDefinitivo(cliente: Cliente) {
    if (!db) {
      setErrorAccion("Firebase no está configurado.");
      return;
    }
    const seguro = window.confirm(`¿Eliminar definitivamente ${cliente.empresa}? Esto borrará el perfil y sus accesos de la base de datos. No se puede deshacer.`);
    if (!seguro) return;
    setAccionandoId(cliente.id);
    setErrorAccion("");
    try {
      await borrarQuery(query(collection(db, "contratos"), where("cliente_id", "==", cliente.id)));
      await borrarQuery(query(collection(db, "informesCliente"), where("cliente_id", "==", cliente.id)));
      await borrarQuery(query(collection(db, "solicitudesCampana"), where("cliente_id", "==", cliente.id)));
      await borrarQuery(query(collection(db, "portalUsers"), where("clienteId", "==", cliente.id)));
      await borrarQuery(query(collection(db, "invitacionesPortal"), where("clienteId", "==", cliente.id)));
      const clienteDoc = cliente.ruc || cliente.documento || cliente.documentoIdentidad || cliente.numDoc || cliente.numeroDocumento || cliente.cliente_doc;
      if (clienteDoc) {
        await borrarQuery(query(collection(db, "facturas"), where("cliente_doc", "==", clienteDoc)));
      }
      const batch = writeBatch(db);
      batch.delete(doc(db, "clientes", cliente.id));
      await batch.commit();
      setMenuCliente(null);
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : "No se pudo eliminar definitivamente.");
    } finally {
      setAccionandoId(null);
    }
  }

  return (
    <div className="admin-picker-shell">
      {espacio.status === "ready" && espacio.bytes !== undefined && (
        <div className="admin-picker-storage" title="Espacio total usado en R2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="5" rx="8" ry="3" />
            <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
            <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
          </svg>
          {formatoEspacio(espacio.bytes)}
        </div>
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
                  {c.avatarUrl ? (
                    <img src={c.avatarUrl} alt="" />
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
