import { useState } from "react";
import { useClientesAdmin } from "../hooks/useClientesAdmin";
import { logout } from "../config/firebase";
import type { Cliente } from "../types";
import { BrandThumb } from "./BrandThumb";
import { filtrarClientes } from "../utils/clientPicker";

interface Props {
  onSelect: (clienteId: string) => void;
}

export default function AdminClientPicker({ onSelect }: Props) {
  const state = useClientesAdmin();
  const [busqueda, setBusqueda] = useState("");

  const clientes: Cliente[] = state.status === "ready" ? state.clientes : [];
  const filtrados = filtrarClientes(clientes, busqueda);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8F9FB" }}>

      {/* Header compacto */}
      <div style={{ background: "#0D1629", padding: "20px 20px 24px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <img src="/logo-player.png" alt="Vista360 Player" style={{ height: 20 }} />
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(59,130,246,0.18)", borderRadius: 20, padding: "4px 12px", marginBottom: 12 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3B82F6" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#93C5FD", letterSpacing: 0.8, textTransform: "uppercase" }}>Modo Administrador</span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 4, lineHeight: 1.2 }}>
          ¿Qué cuenta gestionas?
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>
          Selecciona un cliente para continuar.
        </div>

        {/* Buscador */}
        <div style={{ position: "relative" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar empresa…"
            style={{
              width: "100%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12, padding: "11px 14px 11px 36px", fontSize: 14, color: "#fff",
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {/* Lista compacta */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {state.status === "loading" && (
          <div style={{ textAlign: "center", color: "#9CA3AF", fontSize: 14, marginTop: 32 }}>Cargando clientes…</div>
        )}
        {state.status === "error" && (
          <div style={{ textAlign: "center", color: "#EF4444", fontSize: 13, marginTop: 32 }}>{state.message}</div>
        )}
        {state.status === "ready" && filtrados.length === 0 && (
          <div style={{ textAlign: "center", color: "#9CA3AF", fontSize: 14, marginTop: 32 }}>No se encontró ningún cliente.</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtrados.map((c) => (
            <div key={c.id} onClick={() => onSelect(c.id)} style={{
              background: "#fff", borderRadius: 14, padding: "12px 14px",
              display: "flex", alignItems: "center", gap: 12,
              boxShadow: "0 1px 3px rgba(0,0,0,0.07)", cursor: "pointer",
            }}>
              <BrandThumb name={c.empresa ?? "?"} size={44} radius={10} fontSize={14} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0D1629", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.empresa}</div>
                {c.ciudad && <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 1 }}>📍 {c.ciudad}</div>}
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          ))}
        </div>

        <div style={{ height: 16 }} />
      </div>

      {/* Footer cerrar sesión */}
      <div style={{ padding: "12px 16px 20px", borderTop: "1px solid #F3F4F6", background: "#fff", flexShrink: 0 }}>
        <button onClick={() => logout()} style={{
          width: "100%", padding: 14, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
          borderRadius: 12, color: "#DC2626", fontWeight: 600, fontSize: 14, cursor: "pointer",
        }}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
