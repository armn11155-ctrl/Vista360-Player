import type { Cliente, Contrato, FotoCampania, Panel } from "../../types";
import { estadoCampana } from "../../types";

interface Props {
  cliente: Cliente | null;
  contratos: Contrato[];
  paneles: Record<string, Panel>;
  onGoTo: (tab: "campanas" | "evidencias" | "reportes" | "nueva") => void;
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

export default function Inicio({ cliente, contratos, paneles, onGoTo }: Props) {
  const activas = contratos.filter((c) => estadoCampana(c) === "Activa");
  const pantallasActivas = new Set(activas.map((c) => c.panel_id)).size;
  const ultima = ultimaFoto(contratos);
  const proxVenc = proximoVencimiento(contratos);
  const todoOk = activas.length > 0 || contratos.length === 0;

  return (
    <div>
      <div className="header-dark">
        <div className="logo-row">
          <div>
            <span className="logo-text">VISTA360</span>
            <span className="logo-sub">PLAYER</span>
          </div>
          <div className="notif-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
        </div>
        <div className="greeting">Hola,</div>
        <div className="greeting-name">{cliente?.empresa ?? "Cliente"} 👋</div>
        <div className="status-pill">
          <div className="green-dot" style={{ background: todoOk ? "#22C55E" : "#F59E0B" }} />
          {todoOk ? "Todo funcionando" : "Revisa tus campañas"}
        </div>
      </div>

      <div className="content-area">
        <div className="card">
          <div className="section-title">Resumen general</div>
          <div className="kpi-grid">
            <div className="kpi-item">
              <div className="kpi-icon blue">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
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
                  <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
                </svg>
              </div>
              <div>
                <div className="kpi-label">Última evidencia</div>
                <div className="kpi-value" style={{ fontSize: 13 }}>
                  {ultima ? ultima.foto.fecha : "—"}
                </div>
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
                <div className="kpi-value" style={{ fontSize: 13 }}>
                  {proxVenc ? proxVenc.fin : "—"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="section-title">Accesos rápidos</div>
          <div className="quick-access">
            <div className="qa-item" onClick={() => onGoTo("campanas")}>
              <div className="qa-icon blue">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <span className="qa-label">Mis campañas</span>
            </div>
            <div className="qa-item" onClick={() => onGoTo("evidencias")}>
              <div className="qa-icon green">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
              <span className="qa-label">Evidencias</span>
            </div>
            <div className="qa-item" onClick={() => onGoTo("reportes")}>
              <div className="qa-icon purple">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2">
                  <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </div>
              <span className="qa-label">Reportes</span>
            </div>
            <div className="qa-item" onClick={() => onGoTo("nueva")}>
              <div className="qa-icon orange">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              </div>
              <span className="qa-label">Nueva campaña</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="section-title">Última evidencia recibida</div>
          {ultima ? (
            <div className="evidence-preview">
              <div className="evidence-img" style={{ borderRadius: 10, width: 72, height: 72, overflow: "hidden", flexShrink: 0 }}>
                <img src={ultima.foto.url} className="evidence-photo-real" alt="Evidencia" />
              </div>
              <div className="evidence-info">
                <div className="evidence-loc">Pantalla: {paneles[ultima.panel ?? ""]?.nombre ?? ultima.panel}</div>
                <div className="evidence-date">{ultima.foto.fecha}</div>
                <div className="link-blue" onClick={() => onGoTo("evidencias")}>Ver evidencia ›</div>
              </div>
            </div>
          ) : (
            <div className="state-sub">Aún no hay evidencias registradas.</div>
          )}
        </div>
      </div>
    </div>
  );
}
