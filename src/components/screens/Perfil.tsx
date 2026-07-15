import type { Cliente } from "../../types";
import { logout } from "../../config/firebase";

interface Props {
  cliente: Cliente | null;
  email: string;
  isAdmin?: boolean;
  onCambiarCliente?: () => void;
}

function Row({ icon, label, value, danger, onClick }: { icon: React.ReactNode; label: string; value?: string; danger?: boolean; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", padding: "14px 16px",
      background: "#fff", borderBottom: "1px solid #F3F4F6", cursor: onClick ? "pointer" : "default", gap: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: danger ? "rgba(239,68,68,0.1)" : "#F3F4F6",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>{icon}</div>
      <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: danger ? "#EF4444" : "#0D1629" }}>{label}</span>
      {value && <span style={{ fontSize: 13, color: "#6B7280" }}>{value}</span>}
      {!danger && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>}
    </div>
  );
}

export default function Perfil({ cliente, email, isAdmin, onCambiarCliente }: Props) {
  const initials = (cliente?.empresa ?? "?").slice(0, 2).toUpperCase();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8F9FB" }}>
      {/* Header dark con avatar */}
      <div style={{ background: "#0D1629", padding: "calc(24px + env(safe-area-inset-top)) 20px 26px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 60, height: 60, borderRadius: "50%", background: "#CC0000",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, fontWeight: 800, color: "#fff", flexShrink: 0,
          }}>{initials}</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>{cliente?.empresa ?? "Cliente"}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{email}{isAdmin ? " · viendo como admin" : ""}</div>
            {cliente?.estado === "Activo" && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 4, background: "#22C55E",
                color: "#fff", padding: "3px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600, marginTop: 6,
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                Cuenta activa
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sections */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Información */}
        <div style={{ padding: "18px 16px 6px", fontSize: 12, fontWeight: 700, color: "#6B7280", letterSpacing: 0.8, textTransform: "uppercase" }}>
          Información de la empresa
        </div>
        <Row icon={<span style={{ fontSize: 16 }}>🏢</span>} label="Empresa" value={cliente?.empresa} />
        <Row icon={<span style={{ fontSize: 16 }}>📞</span>} label="Contacto" value={cliente?.contacto} />
        <Row icon={<span style={{ fontSize: 16 }}>📍</span>} label="Ciudad" value={cliente?.ciudad} />

        {isAdmin && (
          <>
            <div style={{ padding: "18px 16px 6px", fontSize: 12, fontWeight: 700, color: "#6B7280", letterSpacing: 0.8, textTransform: "uppercase" }}>Admin</div>
            <Row icon={<span style={{ fontSize: 16 }}>🔁</span>} label="Cambiar de cliente" onClick={onCambiarCliente} />
          </>
        )}

        <div style={{ padding: "18px 16px 6px", fontSize: 12, fontWeight: 700, color: "#6B7280", letterSpacing: 0.8, textTransform: "uppercase" }}>Soporte</div>
        <Row icon={<span style={{ fontSize: 16 }}>🧑‍💼</span>} label="Mi ejecutivo" value={cliente?.ejecutivo ?? "Vista360"} />
        <Row icon={<span style={{ fontSize: 16 }}>🚪</span>} label="Cerrar sesión" danger onClick={() => logout()} />
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
