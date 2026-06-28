import { useState } from "react";
import { useClientesAdmin } from "../hooks/useClientesAdmin";
import { logout } from "../config/firebase";
import type { Cliente } from "../types";

interface Props {
  onSelect: (clienteId: string) => void;
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
              <div className="admin-picker-avatar">{(c.empresa ?? "?").slice(0, 2).toUpperCase()}</div>
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
