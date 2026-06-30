import type { Cliente, Contrato, FotoCampania, Panel } from "../../types";
import { estadoCampana } from "../../types";

interface Props {
  cliente: Cliente | null;
  contratos: Contrato[];
  paneles: Record<string, Panel>;
  onGoTo: (tab: "campanas" | "evidencias" | "reportes" | "nueva") => void;
  onMenuClick?: () => void;
  isAdmin?: boolean;
  adminNombre?: string | null;
}

function ultimaFoto(contratos: Contrato[]): { foto: FotoCampania; panel?: string } | null {
  let best: { foto: FotoCampania; panel?: string } | null = null;
  for (const c of contratos) {
    for (const f of c.fotos_campania ?? []) {
      if (!best || f.fecha > best.foto.fecha) best = { foto: f, panel: c.panel_id };
    }
  }
  return best;
}

function proximoVencimiento(contratos: Contrato[]): Contrato | null {
  const activos = contratos
    .filter((c) => estadoCampana(c) !== "Finalizada")
    .sort((a, b) => a.fin.localeCompare(b.fin));
  return activos[0] ?? null;
}

export default function Inicio({ cliente, contratos, paneles, onGoTo, onMenuClick, isAdmin, adminNombre }: Props) {
  const activas = contratos.filter((c) => estadoCampana(c) === "Activa");
  const pantallasActivas = new Set(activas.map((c) => c.panel_id)).size;
  const ultima = ultimaFoto(contratos);
  const proxVenc = proximoVencimiento(contratos);
  const todoOk = activas.length > 0 || contratos.length === 0;
  const nombre = isAdmin ? (adminNombre || "Admin") : (cliente?.empresa ?? "Cliente");

  const hora = new Date().getHours();
  const saludo = hora < 12 ? "Buenos días," : hora < 19 ? "Buenas tardes," : "Buenas noches,";

  return (
    <div>
      {/* HEADER DARK */}
      <div className="header-dark">
        <div className="logo-row">
          <button className="header-menu-btn" onClick={onMenuClick} aria-label="Abrir menú">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.2" strokeLinecap="round">
              <line x1="3" y1="7" x2="21" y2="7" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="17" x2="21" y2="17" />
            </svg>
          </button>
          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", letterSpacing: 0.5 }}>VISTA360</div>
            <div style={{ fontSize: 9, fontWeight: 600, color: "#3B82F6", letterSpacing: 3, textAlign: "center" }}>PLAYER</div>
          </div>
          <div className="notif-btn" style={{ position: "relative" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <div style={{ position: "absolute", top: -2, right: -2, width: 8, height: 8, background: "#EF4444", borderRadius: "50%", border: "1.5px solid #0D1629" }} />
          </div>
        </div>
        <div className="greeting">{saludo}</div>
        <div className="greeting-name">{nombre} 👋</div>
        {isAdmin && (
          <div className="admin-context-pill">
            <span className="admin-context-dot" />
            Gestionando la cuenta de <strong>{cliente?.empresa ?? "—"}</strong>
          </div>
        )}
        <div className="status-pill">
          <div className="green-dot" style={{ background: todoOk ? "#22C55E" : "#F59E0B" }} />
          {todoOk ? "Todo funcionando" : "Revisa tus campañas"}
        </div>
      </div>

      {/* CONTENT */}
      <div className="content-area">

        {/* Resumen general */}
        <div className="card">
          <div className="section-title">Resumen general</div>
          <div className="kpi-grid">
            <div className="kpi-item">
              <div className="kpi-icon blue">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div>
                <div className="kpi-label">Campañas activas</div>
                <div className="kpi-value">{activas.length}</div>
              </div>
            </div>
            <div className="kpi-item">
              <div className="kpi-icon green">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
                </svg>
              </div>
              <div>
                <div className="kpi-label">Pantallas activas</div>
                <div className="kpi-value">{pantallasActivas}</div>
              </div>
            </div>
            <div className="kpi-item">
              <div className="kpi-icon purple">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
              <div>
                <div className="kpi-label">Última evidencia</div>
                <div className="kpi-value" style={{ fontSize: 12 }}>{ultima ? ultima.foto.fecha : "—"}</div>
              </div>
            </div>
            <div className="kpi-item">
              <div className="kpi-icon orange">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <div>
                <div className="kpi-label">Próx. vencimiento</div>
                <div className="kpi-value" style={{ fontSize: 12 }}>{proxVenc ? proxVenc.fin : "—"}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Accesos rápidos */}
        <div className="card">
          <div className="section-title">Accesos rápidos</div>
          <div className="quick-access">
            <div className="qa-item" onClick={() => onGoTo("campanas")}>
              <div className="qa-icon blue">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <span className="qa-label">Mis campañas</span>
            </div>
            <div className="qa-item" onClick={() => onGoTo("evidencias")}>
              <div className="qa-icon green">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
              <span className="qa-label">Evidencias</span>
            </div>
            <div className="qa-item" onClick={() => onGoTo("reportes")}>
              <div className="qa-icon purple">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2">
                  <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </div>
              <span className="qa-label">Reportes</span>
            </div>
            <div className="qa-item" onClick={() => onGoTo("nueva")}>
              <div className="qa-icon orange">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              </div>
              <span className="qa-label">Nueva campaña</span>
            </div>
          </div>
        </div>

        {/* Última evidencia */}
        <div className="card">
          <div className="section-title">Última evidencia recibida</div>
          {ultima ? (
            <div className="evidence-preview">
              <div style={{ width: 72, height: 72, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "#E5E7EB" }}>
                <img src={ultima.foto.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="Evidencia" />
              </div>
              <div className="evidence-info">
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0D1629" }}>Pantalla: {paneles[ultima.panel ?? ""]?.nombre ?? ultima.panel}</div>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{ultima.foto.fecha}</div>
                <div className="link-blue" style={{ marginTop: 6, fontSize: 13 }} onClick={() => onGoTo("evidencias")}>Ver evidencia ›</div>
              </div>
            </div>
          ) : (
            <div style={{ color: "#6B7280", fontSize: 13, padding: "4px 0" }}>Aún no hay evidencias registradas.</div>
          )}
        </div>
      </div>
    </div>
  );
}
