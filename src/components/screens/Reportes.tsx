import { useInformes } from "../../hooks/useInformes";

interface Props {
  clienteId: string;
  hayContratos: boolean;
}

export default function Reportes({ clienteId, hayContratos }: Props) {
  const informesState = useInformes(clienteId);
  const informes = informesState.status === "ready" ? informesState.informes : [];

  return (
    <div>
      <div className="evidencias-header">
        <div className="ev-logo-row">
          <div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>Reportes</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", background: "#F0F2F7", padding: 14 }}>
        <div className="report-header-blue">
          <div>
            <div className="text-blue">Reportes mensuales</div>
            <div className="text-sub">
              Se generan solos el día 1 de cada mes con el resumen de tus campañas.
            </div>
          </div>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.5">
            <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        </div>

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
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2">
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
                <a className="report-download" href={informe.url} target="_blank" rel="noreferrer">
                  Descargar
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
