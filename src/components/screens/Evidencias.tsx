import type { Contrato, Panel } from "../../types";

interface Props {
  contratos: Contrato[];
  paneles: Record<string, Panel>;
}

interface FotoConContexto {
  url: string;
  fecha: string;
  panelNombre: string;
}

export default function Evidencias({ contratos, paneles }: Props) {
  const fotos: FotoConContexto[] = [];
  for (const c of contratos) {
    for (const f of c.fotos_campania ?? []) {
      fotos.push({ url: f.url, fecha: f.fecha, panelNombre: paneles[c.panel_id]?.nombre ?? c.panel_id });
    }
  }
  fotos.sort((a, b) => b.fecha.localeCompare(a.fecha));

  // Agrupar por fecha (solo la parte de fecha, sin hora si la tuviera)
  const grupos = new Map<string, FotoConContexto[]>();
  for (const f of fotos) {
    const key = f.fecha.split(" ")[0] ?? f.fecha;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key)!.push(f);
  }

  return (
    <div>
      <div className="evidencias-header">
        <div className="ev-logo-row">
          <div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>Evidencias</div>
        </div>
      </div>

      <div className="ev-content">
        {fotos.length === 0 && (
          <div className="state-sub" style={{ marginTop: 40, textAlign: "center" }}>
            Todavía no hay evidencias registradas para tus campañas. Aquí verás las fotos
            de tus anuncios en las pantallas en cuanto el equipo las suba.
          </div>
        )}

        {Array.from(grupos.entries()).map(([fecha, items]) => (
          <div key={fecha}>
            <div className="ev-section-title">{fecha}</div>
            <div className="photo-grid">
              {items.map((f, i) => (
                <div className="photo-item" key={`${fecha}-${i}`}>
                  <img src={f.url} className="evidence-photo-real" alt={`Evidencia ${f.panelNombre}`} />
                  <div className="photo-overlay">
                    <div className="photo-time">{f.fecha}</div>
                    <div className="photo-loc">{f.panelNombre}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{ height: 16 }} />
      </div>
    </div>
  );
}
