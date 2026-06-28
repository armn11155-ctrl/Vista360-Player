import { useState } from "react";
import { useClientesAdmin } from "../hooks/useClientesAdmin";
import { logout } from "../config/firebase";
import type { Cliente } from "../types";

interface Props {
  onSelect: (clienteId: string) => void;
}

// Paleta de colores para los avatares — solo tonos de azul (de más oscuro
// a más claro), pero cada cliente siempre saca el mismo tono (no cambia al
// recargar) porque se elige según su propio id.
const AVATAR_COLORS = ["#0D1629", "#1E3A8A", "#1D4ED8", "#2563EB", "#3B82F6", "#0EA5E9", "#0284C7", "#0369A1"];

function colorParaCliente(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function IconoUsuario() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 1C8.96243 1 6.5 3.46243 6.5 6.5C6.5 9.53757 8.96243 12 12 12C15.0376 12 17.5 9.53757 17.5 6.5C17.5 3.46243 15.0376 1 12 1Z" fill="#fff" />
      <path d="M7 14C4.23858 14 2 16.2386 2 19V22C2 22.5523 2.44772 23 3 23H21C21.5523 23 22 22.5523 22 22V19C22 16.2386 19.7614 14 17 14H7Z" fill="#fff" />
    </svg>
  );
}

export default function AdminClientPicker({ onSelect }: Props) {
  const state = useClientesAdmin();
  const [busqueda, setBusqueda] = useState("");

  const clientes: Cliente[] = state.status === "ready" ? state.clientes : [];
  const filtrados = clientes.filter((c) =>
    c.empresa?.toLowerCase().includes(busqueda.toLowerCase().trim())
  );

  return (
    <div className="admin-picker-shell">
      <div className="admin-picker-header">
        <img src="/logo-player.png" alt="Vista360 Player" className="admin-picker-logo" />
        <span className="admin-picker-badge">Modo administrador</span>
        <div className="admin-picker-title">¿Qué cuenta quieres gestionar?</div>
        <div className="admin-picker-sub">Elige un cliente para ver y administrar su información.</div>
        <input
          className="admin-picker-search"
          placeholder="Buscar empresa..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <div className="admin-picker-body">
        {state.status === "loading" && <div className="state-sub">Cargando clientes…</div>}
        {state.status === "error" && <div className="state-sub">{state.message}</div>}
        {state.status === "ready" && filtrados.length === 0 && (
          <div className="state-sub" style={{ marginTop: 24 }}>No se encontró ningún cliente.</div>
        )}
        <div className="admin-picker-grid">
          {filtrados.map((c) => (
            <div key={c.id} className="admin-picker-card" onClick={() => onSelect(c.id)}>
              <div className="admin-picker-avatar" style={{ background: colorParaCliente(c.id) }}>
                <IconoUsuario />
              </div>
              <div className="admin-picker-card-info">
                <div className="admin-picker-card-name">{c.empresa}</div>
                {c.ciudad && <div className="admin-picker-card-city">{c.ciudad}</div>}
              </div>
              <span className="chevron">›</span>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-picker-footer">
        <button className="admin-picker-logout" onClick={() => logout()}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
