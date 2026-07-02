import { useInformes } from "../../hooks/useInformes";

interface Props {
  clienteId: string;
  hayContratos: boolean;
  isAdmin?: boolean;
}

const GITHUB_ACTIONS_URL =
  "https://github.com/armn11155-ctrl/Vista360/actions/workflows/informe-mensual-clientes.yml";

export default function Reportes({ clienteId, hayContratos, isAdmin }: Props) {
  const informesState = useInformes(clienteId);
  const informes = informesState.status === "ready" ? informesState.informes : [];

  return (
    <div>
      <div className="evidencias-header">
        <div className="ev-logo-row">
          <div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>Reportes</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", background: "#0A1220", padding: 14 }}>
        <div className="report-header-blue">
          <div>
            <div className="text-blue">Reportes mensuales</div>
            <div className="text-sub">
              Se generan solos el día 1 de cada mes con el resumen de tus campañas.
            </div>
          </div>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="1.5">
            <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        </div>

        {isAdmin && (
          <a
            href={GITHUB_ACTIONS_URL}
            target="_blank"
            rel="noreferrer"
            className="card"
            style={{
              display: "flex", alignItems: "center", gap: 12, marginTop: 10,
              background: "rgba(59,130,246,0.14)", textDecoration: "none", cursor: "pointer",
            }}
          >
            <div className="contact-btn-icon" style={{ background: "#3B82F6", flexShrink: 0 }}>⚡</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: "#1D4ED8" }}>
                Generar reportes ahora
              </div>
              <div style={{ fontSize: 12, color: "#1D4ED8", opacity: 0.85, marginTop: 1 }}>
                Corre el proceso mensual para todos los clientes (PDF + correo), sin esperar
                al día 1. Solo tú ves este botón.
              </div>
            </div>
            <span style={{ fontSize: 18, color: "#1D4ED8" }}>↗</span>
          </a>
        )}

        {!hayContratos && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center" }}>
            Todavía no tienes campañas para generar reportes.
          </div>
        )}

        {hayContratos && informesState.status === "loading" && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center" }}>Cargando…</div>
        )}

        {hayContratos && informesState.status === "ready" && informes.length === 0 && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center" }}>
            Todavía no se ha generado ningún reporte mensual. El primero va a aparecer aquí
            el día 1 del próximo mes.
          </div>
        )}

        {informes.length > 0 && (
          <div className="card">
            {informes.map((informe) => (
              <div className="report-item" key={informe.id}>
                <div className="report-icon blue">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div className="report-info">
                  <div className="report-name">{informe.mesLabel}</div>
                  <div className="report-desc">
                    {informe.numCampanas} campaña(s) · {informe.numEvidencias} evidencia(s)
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {isAdmin && (
                    <a
                      className="report-download"
                      style={{ background: "rgba(34,197,94,0.16)", color: "#16A34A" }}
                      href={`https://wa.me/?text=${encodeURIComponent(
                        `Hola, aquí tienes tu reporte de ${informe.mesLabel} de Vista360: ${informe.url}`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Enviar
                    </a>
                  )}
                  <a className="report-download" href={informe.url} target="_blank" rel="noreferrer">
                    Descargar
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
