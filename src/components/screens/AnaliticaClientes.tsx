import BackButton from "../BackButton";
import { useMemo, useState } from "react";
import { useAccesosClientes } from "../../hooks/useAccesosClientes";
import type { AccesoCliente } from "../../hooks/useAccesosClientes";

// Evidencias, Portafolio, Impacto y Contáctanos se retiraron del app
// hace tiempo y ya no tienen pantalla real -- a pedido del usuario, se
// quitaron también sus nombres de esta tabla. Si algún cliente tiene
// visitas históricas registradas a esas pantallas viejas, ahora se
// van a ver con la llave en crudo (ej. "evidencias") en vez de un
// nombre bonito -- se decidió aceptar eso a cambio de limpiar el código.
const NOMBRES_PANTALLA: Record<string, string> = {
  inicio: "Inicio",
  campanas: "Mis Campañas",
  detalle: "Detalle de campaña",
  reportes: "Reportes",
  perfil: "Perfil",
  nueva: "Nueva campaña",
  cobertura: "Cobertura",
  mispantallas: "Mis Publicidades",
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
  if (ms === null) return "#64748B";
  const dias = (Date.now() - ms) / 86400000;
  if (dias < 3) return "#16A34A";
  if (dias < 14) return "#7C3AED";
  return "#64748B";
}

export default function AnaliticaClientes({ onBack }: Props) {
  const state = useAccesosClientes(true);
  const [cantidadVisible, setCantidadVisible] = useState(40);
  const accesosVisibles = state.status === "ready"
    ? state.accesos.slice(0, cantidadVisible)
    : [];
  const resumen = useMemo(() => {
    if (state.status !== "ready") return null;
    const ahora = Date.now();
    let recientes = 0;
    let sinActividad = 0;
    for (const acceso of state.accesos) {
      if (acceso.lastLogin === null) sinActividad += 1;
      else if (ahora - acceso.lastLogin < 14 * 86_400_000) recientes += 1;
    }
    // El total sale del conteo del servidor, NO de la longitud de lo
    // descargado: la consulta trae como mucho una página (300), así que
    // `accesos.length` diría "300 clientes" aunque hubiera 5.000.
    return { total: state.total, recientes, sinActividad, cargados: state.accesos.length };
  }, [state]);

  return (
    <div className="admin-tool-screen analitica-screen">
      <div className="detail-header">
        <BackButton onClick={onBack} />
        <div className="simple-title">Analítica de acceso</div>
        <div style={{ width: 32 }} />
      </div>

      <div className="content-area">
        <div className="card" style={{ background: "rgba(8,119,255,0.14)", marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: "#1D4ED8", lineHeight: 1.5 }}>
            Última vez que cada cliente entró a su portal. Solo tú puedes ver esta pantalla.
          </div>
        </div>

        {resumen && resumen.total > 0 && (
          <div className="analytics-summary" aria-label="Resumen de actividad de clientes">
            <div><strong>{resumen.total}</strong><span>Clientes</span></div>
            <div><strong>{resumen.recientes}</strong><span>Activos 14 días</span></div>
            <div><strong>{resumen.sinActividad}</strong><span>Sin ingreso</span></div>
          </div>
        )}

        {state.status === "loading" && (
          <div className="premium-loading-panel" role="status">
            <span className="premium-loading-orbit" aria-hidden="true" />
            <div><strong>Preparando actividad</strong><small>Consolidando los accesos recientes</small></div>
          </div>
        )}

        {state.status === "error" && (
          <div className="card">
            <div style={{ fontSize: 13, color: "#DC2626" }}>{state.message}</div>
          </div>
        )}

        {state.status === "ready" && state.accesos.length === 0 && (
          <div className="premium-empty-panel">
            <span className="premium-empty-check premium-empty-clock" aria-hidden="true">↗</span>
            <div><strong>Sin actividad registrada</strong><small>Todavía no hay clientes con accesos al portal.</small></div>
          </div>
        )}

        {state.status === "ready" &&
          accesosVisibles.map((a) => {
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
                      color: "#0B1220",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.empresa}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                    {a.lastLoginCount} {a.lastLoginCount === 1 ? "acceso" : "accesos"} en total
                  </div>
                  {favorita && (
                    <div style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>
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

        {state.status === "ready" && state.accesos.length > accesosVisibles.length && (
          <button
            type="button"
            className="retry-btn"
            style={{ display: "block", margin: "14px auto 4px" }}
            onClick={() => setCantidadVisible((cantidad) => cantidad + 40)}
          >
            Ver 40 clientes más
          </button>
        )}

        {/* Si el negocio crece por encima de una página, se dice en vez de
            dar a entender que esto son todos los clientes. Antes la
            pantalla bajaba una ficha por cliente y con 10.000 cuentas eso
            era la cuota diaria gratuita entera en una sola apertura. */}
        {state.status === "ready" && state.hayMas && (
          <p style={{ textAlign: "center", opacity: 0.7, fontSize: 13, marginTop: 10 }}>
            Mostrando los {state.accesos.length} clientes con actividad más reciente
            {" "}de {state.total}.
          </p>
        )}
      </div>
    </div>
  );
}
