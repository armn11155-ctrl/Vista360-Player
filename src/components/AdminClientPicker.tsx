import { useState } from "react";
import { useClientesAdmin } from "../hooks/useClientesAdmin";
import { logout } from "../config/firebase";
import type { Cliente } from "../types";
import { brandColor, brandInitials } from "../utils/brandColor";
import { filtrarClientes } from "../utils/clientPicker";

interface Props {
  onSelect: (clienteId: string) => void;
}

/**
 * Selector de cuenta del admin — estilo "perfiles" (como Netflix):
 * tiles cuadrados con color + iniciales de marca, sobre un fondo
 * fotográfico. Grid responsivo: pocas columnas en móvil, más en
 * escritorio, siempre centrado y ocupando toda la pantalla.
 */
export default function AdminClientPicker({ onSelect }: Props) {
  const state = useClientesAdmin();
  const [busqueda, setBusqueda] = useState("");

  const clientes: Cliente[] = state.status === "ready" ? state.clientes : [];
  const filtrados = filtrarClientes(clientes, busqueda);

  return (
    <div className="admin-picker-shell">
      <div className="admin-picker-header">
        <img src="/logo-player.png" alt="Vista360 Player" className="admin-picker-logo" />
        <div className="admin-picker-badge">
          <span className="admin-picker-badge-dot" />
          Modo Administrador
        </div>
        <div className="admin-picker-title">¿Qué cuenta gestionas?</div>
        <div className="admin-picker-sub">Selecciona un perfil de cliente para continuar.</div>

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
          <div className="admin-picker-empty">No se encontró ningún cliente.</div>
        )}

        <div className="admin-picker-grid">
          {filtrados.map((c) => {
            const { bg, text } = brandColor(c.empresa ?? "?");
            const initials = brandInitials(c.empresa ?? "?");
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className="admin-picker-tile"
              >
                <span className="admin-picker-tile-avatar" style={{ background: bg, color: text }}>
                  {initials}
                </span>
                <span className="admin-picker-tile-name">{c.empresa}</span>
                {c.ciudad && <span className="admin-picker-tile-city">📍 {c.ciudad}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="admin-picker-footer">
        <button onClick={() => logout()} className="admin-picker-logout">
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
