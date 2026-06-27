interface Props {
  hayContratos: boolean;
}

export default function Reportes({ hayContratos }: Props) {
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
            <div className="text-blue">Reportes detallados</div>
            <div className="text-sub">Próximamente vas a poder descargar informes de rendimiento de tus campañas.</div>
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

        {hayContratos && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center" }}>
            Mientras tanto, puedes ver el detalle y avance de cada campaña en "Mis campañas",
            y las fotos de instalación en "Evidencias". Si necesitas un reporte ahora,
            escríbele a tu ejecutivo desde "Perfil".
          </div>
        )}
      </div>
    </div>
  );
}
