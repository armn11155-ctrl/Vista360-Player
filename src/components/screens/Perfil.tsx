import type { Cliente } from "../../types";
import { logout } from "../../config/firebase";

interface Props {
  cliente: Cliente | null;
  email: string;
}

function MenuItem({ icon, label, value, danger, onClick }: { icon: string; label: string; value?: string; danger?: boolean; onClick?: () => void }) {
  return (
    <div className={`menu-item ${danger ? "danger" : ""}`} onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      <div className="menu-item-icon" style={danger ? { background: "#FEF2F2" } : undefined}>
        <span style={{ fontSize: 15 }}>{icon}</span>
      </div>
      <span className="menu-item-label">{label}</span>
      {value && <span className="menu-item-value">{value}</span>}
      {!danger && <span className="menu-item-chevron">›</span>}
    </div>
  );
}

export default function Perfil({ cliente, email }: Props) {
  return (
    <div>
      <div className="profile-header">
        <div className="profile-avatar">
          <span style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>
            {(cliente?.empresa ?? "?").slice(0, 2).toUpperCase()}
          </span>
        </div>
        <div>
          <div className="profile-name">{cliente?.empresa ?? "Cliente"}</div>
          <div className="profile-since">{email}</div>
          {cliente?.estado === "Activo" && (
            <div className="verified-badge">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Cuenta activa
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", background: "#F0F2F7" }}>
        <div className="profile-section-title">Información de la empresa</div>
        <div>
          <MenuItem icon="🏢" label="Empresa" value={cliente?.empresa} />
          <MenuItem icon="📞" label="Contacto" value={cliente?.contacto} />
          <MenuItem icon="📍" label="Ciudad" value={cliente?.ciudad} />
        </div>

        <div className="profile-section-title">Soporte</div>
        <div>
          <MenuItem icon="🧑‍💼" label="Mi ejecutivo" value={cliente?.ejecutivo ?? "Vista360"} />
          <MenuItem icon="🚪" label="Cerrar sesión" danger onClick={() => logout()} />
        </div>
        <div style={{ height: 16 }} />
      </div>
    </div>
  );
}
