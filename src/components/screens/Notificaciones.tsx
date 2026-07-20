import { useEffect, useState } from "react";
import BackChevron from "../BackChevron";
import { eliminarNotificacion, marcarNotificacionesLeidas, useNotificaciones } from "../../hooks/useNotificaciones";
import { activarNotificacionesPush, estadoPermisoNotificaciones, pushDisponible } from "../../utils/pushNotifications";

interface Props {
  clienteId: string;
  uid?: string;
  onBack: () => void;
}

type EstadoPush = "oculto" | "ofrecer" | "activando" | "activado" | "error" | "bloqueado";

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

export default function Notificaciones({ clienteId, uid, onBack }: Props) {
  const state = useNotificaciones(clienteId);
  const idsVisibles = state.status === "ready" ? state.notifs.map((n) => n.id).join("|") : "";

  useEffect(() => {
    if (idsVisibles) {
      marcarNotificacionesLeidas(clienteId, idsVisibles.split("|"));
    }
  }, [clienteId, idsVisibles]);

  // ── Activar notificaciones push -- avisan aunque el cliente no
  // tenga la app abierta (campaña por vencer, reporte nuevo, factura
  // nueva). Se ofrece acá mismo, en la pantalla de notificaciones,
  // que es donde tiene más sentido. ──
  const [estadoPush, setEstadoPush] = useState<EstadoPush>("oculto");
  const [errorPush, setErrorPush] = useState("");

  useEffect(() => {
    let cancelado = false;
    const permiso = estadoPermisoNotificaciones();
    if (permiso === "granted") { setEstadoPush("activado"); return; }
    if (permiso === "denied") { setEstadoPush("bloqueado"); return; }
    pushDisponible().then((disponible) => {
      if (!cancelado && disponible) setEstadoPush("ofrecer");
    });
    return () => { cancelado = true; };
  }, []);

  async function activarPush() {
    if (!uid) return;
    setEstadoPush("activando");
    setErrorPush("");
    const res = await activarNotificacionesPush(uid);
    if (res.ok) {
      setEstadoPush("activado");
    } else {
      setEstadoPush("error");
      setErrorPush(res.error);
    }
  }

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
        {(estadoPush === "ofrecer" || estadoPush === "activando" || estadoPush === "error") && (
          <div className="card" style={{ marginBottom: 12, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: "#EEF4FF", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0877FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0D1629" }}>Activar notificaciones</div>
              <div style={{ fontSize: 12, color: "#6B7A99", marginTop: 3, lineHeight: 1.4 }}>
                Te avisamos cuando tu campaña esté por vencer, tengas un reporte nuevo o te llegue una factura — aunque no tengas la app abierta.
              </div>
              {errorPush && <div style={{ fontSize: 11.5, color: "#DC2626", marginTop: 6, fontWeight: 700 }}>{errorPush}</div>}
              <button
                type="button"
                onClick={() => void activarPush()}
                disabled={estadoPush === "activando" || !uid}
                style={{
                  marginTop: 10, background: estadoPush === "activando" ? "#93C5FD" : "#0877FF", color: "#fff",
                  border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 12.5, fontWeight: 800,
                  cursor: estadoPush === "activando" ? "not-allowed" : "pointer",
                }}
              >
                {estadoPush === "activando" ? "Activando..." : "Activar notificaciones"}
              </button>
            </div>
          </div>
        )}

        {estadoPush === "activado" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 12, color: "#16A34A", fontWeight: 700 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Notificaciones activadas
          </div>
        )}

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
              <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>{tiempoRelativo(n.fecha)}</div>
            </div>
            <button
              type="button"
              className="notification-delete-btn"
              onClick={() => eliminarNotificacion(clienteId, n.id)}
              aria-label={`Eliminar notificación: ${n.titulo}`}
              title="Eliminar"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
