import BackChevron from "../BackChevron";
import { useAccesosClientes } from "../../hooks/useAccesosClientes";
import type { AccesoCliente } from "../../hooks/useAccesosClientes";

const NOMBRES_PANTALLA: Record<string, string> = {
  inicio: "Inicio",
  campanas: "Mis Campañas",
  detalle: "Detalle de campaña",
  evidencias: "Evidencias",
  reportes: "Reportes",
  perfil: "Perfil",
  nueva: "Nueva campaña",
  portafolio: "Portafolio",
  cobertura: "Cobertura",
  mispantallas: "Mis Pantallas",
  impacto: "Impacto",
  contactanos: "Contáctanos",
};

/** La pantalla que más veces visitó este cliente, o null si nunca visitó ninguna. */
export function pantallaFavorita(
  pantallasVisitadas: AccesoCliente["pantallasVisitadas"]
): { nombre: string; count: number } | null {
  let mejor: { pantalla: string; count: number } | null = null;
  for (const [pantalla, v] of Object.entries(pantallasVisitadas)) {
    if (!mejor || v.count > mejor.count) mejor = { pantalla, count: v.count };
  }
  if (!mejor) return null;
  return { nombre: NOMBRES_PANTALLA[mejor.pantalla] ?? mejor.pantalla, count: mejor.count };
}

interface Props {
  onBack: () => void;
}

/** "hace 3 días", "hace 2 horas", "hace un momento"... */
export function tiempoRelativo(ms: number | null): string {
  if (ms === null) return "Nunca entró";
  const diffMs = Date.now() - ms;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "Hace un momento";
  if (min < 60) return `Hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `Hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return "Ayer";
  if (dias < 30) return `Hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return `Hace ${meses} ${meses === 1 ? "mes" : "meses"}`;
}

/** Verde si entró hace poco, ámbar si hace un tiempo, gris si nunca/hace mucho. */
export function colorEstado(ms: number | null): string {
  if (ms === null) return "#9CA3AF";
  const dias = (Date.now() - ms) / 86400000;
  if (dias < 3) return "#16A34A";
  if (dias < 14) return "#D97706";
  return "#9CA3AF";
}

export default function AnaliticaClientes({ onBack }: Props) {
  const state = useAccesosClientes(true);

  return (
    <div className="admin-tool-screen analitica-screen">
      <div className="detail-header">
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Analítica de acceso</div>
        <div style={{ width: 32 }} />
      </div>

      <div className="content-area">
        <div className="card" style={{ background: "rgba(59,130,246,0.14)", marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, color: "#1D4ED8", lineHeight: 1.5 }}>
            Última vez que cada cliente entró a su portal. Solo tú puedes ver esta pantalla.
          </div>
        </div>

        {state.status === "loading" && (
          <div className="state-screen" style={{ paddingTop: 40 }}>
            <div className="state-title">Cargando…</div>
          </div>
        )}

        {state.status === "error" && (
          <div className="card">
            <div style={{ fontSize: 13, color: "#DC2626" }}>{state.message}</div>
          </div>
        )}

        {state.status === "ready" && state.accesos.length === 0 && (
          <div className="card">
            <div style={{ fontSize: 13, color: "#6B7A99" }}>
              Todavía no hay clientes con cuenta en el portal.
            </div>
          </div>
        )}

        {state.status === "ready" &&
          state.accesos.map((a) => {
            const favorita = pantallaFavorita(a.pantallasVisitadas);
            return (
              <div
                key={a.clienteId}
                className="card"
                style={{
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#0D1629",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.empresa}
                  </div>
                  <div style={{ fontSize: 11.5, color: "#6B7A99", marginTop: 2 }}>
                    {a.lastLoginCount} {a.lastLoginCount === 1 ? "acceso" : "accesos"} en total
                  </div>
                  {favorita && (
                    <div style={{ fontSize: 11.5, color: "#6B7A99", marginTop: 1 }}>
                      Mira más: {favorita.nombre} ({favorita.count})
                    </div>
                  )}
                </div>
                <div
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    color: colorEstado(a.lastLogin),
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: colorEstado(a.lastLogin),
                    }}
                  />
                  {tiempoRelativo(a.lastLogin)}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
