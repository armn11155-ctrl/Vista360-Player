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
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="header-dark" style={{ paddingBottom: 18 }}>
        <div className="logo-row">
          <div>
            <span className="logo-text">VISTA360</span>
            <span className="logo-sub">ADMIN</span>
          </div>
        </div>
        <div className="greeting">¿A qué cliente quieres ver?</div>
      </div>

      <div style={{ padding: 14, flexShrink: 0 }}>
        <input
          className="form-input"
          placeholder="Buscar empresa..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px" }}>
        {state.status === "loading" && <div className="state-sub">Cargando clientes…</div>}
        {state.status === "error" && <div className="state-sub">{state.message}</div>}
        {state.status === "ready" && filtrados.length === 0 && (
          <div className="state-sub" style={{ marginTop: 24 }}>No se encontró ningún cliente.</div>
        )}
        {filtrados.map((c) => (
          <div
            key={c.id}
            onClick={() => onSelect(c.id)}
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: 14,
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{c.empresa}</div>
              {c.ciudad && <div style={{ fontSize: 12, color: "#9CA3AF" }}>{c.ciudad}</div>}
            </div>
            <span style={{ color: "#D1D5DB", fontSize: 20 }}>›</span>
          </div>
        ))}
      </div>

      <div style={{ padding: 14 }}>
        <button
          onClick={() => logout()}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "1px solid #E5E7EB",
            background: "#fff",
            color: "#DC2626",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
