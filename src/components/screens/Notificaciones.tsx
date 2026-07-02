import BackChevron from "../BackChevron";
import { useNotificaciones } from "../../hooks/useNotificaciones";

interface Props {
  clienteId: string;
  onBack: () => void;
}

const ICONOS = {
  solicitud_pendiente: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  contrato_por_vencer: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  evidencia_nueva: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
    </svg>
  ),
};

const COLORES_BG = {
  solicitud_pendiente: "#FEF3C7",
  contrato_por_vencer: "#FEE2E2",
  evidencia_nueva: "#DCFCE7",
};

function tiempoRelativo(isoFecha: string): string {
  const diff = Date.now() - new Date(isoFecha).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Hace un momento";
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "Ayer" : `Hace ${d} días`;
}

export default function Notificaciones({ clienteId, onBack }: Props) {
  const state = useNotificaciones(clienteId);

  return (
    <div>
      <div className="detail-header">
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Notificaciones</div>
        <div style={{ width: 32 }} />
      </div>

      <div className="content-area">
        {state.status === "loading" && (
          <div className="state-screen" style={{ paddingTop: 40 }}>
            <div className="state-title">Cargando…</div>
          </div>
        )}

        {state.status === "ready" && state.notifs.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔔</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0D1629" }}>Todo al día</div>
            <div style={{ fontSize: 13, color: "#6B7A99", marginTop: 6 }}>No tienes notificaciones nuevas</div>
          </div>
        )}

        {state.status === "ready" && state.notifs.map((n) => (
          <div
            key={n.id}
            className="card"
            style={{ marginBottom: 8, display: "flex", gap: 12, alignItems: "flex-start" }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: COLORES_BG[n.tipo],
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {ICONOS[n.tipo]}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0D1629" }}>{n.titulo}</div>
              <div style={{ fontSize: 12, color: "#6B7A99", marginTop: 3, lineHeight: 1.4 }}>{n.detalle}</div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>{tiempoRelativo(n.fecha)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
