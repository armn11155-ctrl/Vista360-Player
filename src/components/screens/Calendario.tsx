import { useMemo, useState } from "react";
import BackChevron from "../BackChevron";
import type { Contrato, Panel } from "../../types";
import { panelesDeContrato } from "../../types";

interface Props {
  contratos: Contrato[];
  paneles: Record<string, Panel>;
  modo: "cliente" | "admin";
  /** clienteId -> nombre de empresa -- solo se usa en modo "admin". */
  nombresClientes?: Record<string, string>;
  onBack: () => void;
}

interface EventoDia {
  tipo: "inicio" | "fin";
  contrato: Contrato;
  nombre: string;
}

const DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"];
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function nombreCampana(contrato: Contrato, paneles: Record<string, Panel>): string {
  if (contrato.nombre?.trim()) return contrato.nombre.trim();
  const nombres = panelesDeContrato(contrato)
    .map((id) => paneles[id]?.nombre)
    .filter((n): n is string => Boolean(n));
  return nombres.join(" + ") || "Campaña";
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function claveFecha(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function Calendario({ contratos, paneles, modo, nombresClientes, onBack }: Props) {
  const hoy = new Date();
  const [mesVisible, setMesVisible] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);

  // Mapa fecha ("YYYY-MM-DD") -> eventos ese día (inicio o fin de una
  // campaña). Se arma una vez por lista de contratos, no en cada
  // render del grid.
  const eventosPorFecha = useMemo(() => {
    const mapa: Record<string, EventoDia[]> = {};
    for (const contrato of contratos) {
      const nombre = nombreCampana(contrato, paneles);
      if (contrato.inicio) {
        (mapa[contrato.inicio] ??= []).push({ tipo: "inicio", contrato, nombre });
      }
      if (contrato.fin) {
        (mapa[contrato.fin] ??= []).push({ tipo: "fin", contrato, nombre });
      }
    }
    return mapa;
  }, [contratos, paneles]);

  const año = mesVisible.getFullYear();
  const mes = mesVisible.getMonth();
  const primerDiaSemana = (new Date(año, mes, 1).getDay() + 6) % 7; // 0 = lunes
  const diasEnMes = new Date(año, mes + 1, 0).getDate();
  const hoyStr = claveFecha(hoy);

  const celdas: (number | null)[] = [
    ...Array(primerDiaSemana).fill(null),
    ...Array.from({ length: diasEnMes }, (_, i) => i + 1),
  ];

  // Días del mes visible que caen DENTRO del rango de alguna campaña
  // (entre inicio y fin, inclusive) -- para pintar de azul el "tiempo
  // que está" corriendo la campaña, no solo marcar con un punto el día
  // que empieza y el que termina. Se recalcula solo por mes visible
  // (no todo el año) para no iterar rangos larguísimos si alguna
  // campaña no tiene fecha de fin cercana.
  const diasActivosDelMes = useMemo(() => {
    const activos = new Set<string>();
    for (let d = 1; d <= diasEnMes; d++) {
      const fecha = `${año}-${pad(mes + 1)}-${pad(d)}`;
      const activa = contratos.some((c) => c.inicio && c.fin && c.inicio <= fecha && fecha <= c.fin);
      if (activa) activos.add(fecha);
    }
    return activos;
  }, [contratos, año, mes, diasEnMes]);

  const eventosDelDia = diaSeleccionado ? eventosPorFecha[diaSeleccionado] ?? [] : [];

  // Próximos eventos (a partir de hoy), para no depender de que la
  // persona toque un día -- se ve algo útil apenas entra.
  const proximosEventos = useMemo(() => {
    const lista: { fecha: string; evento: EventoDia }[] = [];
    for (const [fecha, eventos] of Object.entries(eventosPorFecha)) {
      if (fecha < hoyStr) continue;
      eventos.forEach((evento) => lista.push({ fecha, evento }));
    }
    return lista.sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 12);
  }, [eventosPorFecha, hoyStr]);

  function irMes(delta: number) {
    setMesVisible(new Date(año, mes + delta, 1));
    setDiaSeleccionado(null);
  }

  function formatoCorto(fecha: string) {
    const [y, m, d] = fecha.split("-").map(Number);
    return `${d} ${MESES[m - 1].slice(0, 3)}`;
  }

  return (
    <div>
      <div className="detail-header notif-header">
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Calendario</div>
        <div style={{ width: 32 }} />
      </div>

      <div className="content-area">
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => irMes(-1)}
              aria-label="Mes anterior"
              style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer" }}
            >
              ‹
            </button>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: "#0D1629" }}>
              {MESES[mes]} {año}
            </div>
            <button
              type="button"
              onClick={() => irMes(1)}
              aria-label="Mes siguiente"
              style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer" }}
            >
              ›
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
            {DIAS_SEMANA.map((d) => (
              <div key={d} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 800, color: "#9CA3AF" }}>
                {d}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "#6B7A99", fontWeight: 700 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: "rgba(8,119,255,0.14)" }} /> Campaña corriendo
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "#6B7A99", fontWeight: 700 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} /> Empieza
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "#6B7A99", fontWeight: 700 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#EF4444" }} /> Termina
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
            {celdas.map((dia, i) => {
              if (dia === null) return <div key={`vacio-${i}`} />;
              const fecha = `${año}-${pad(mes + 1)}-${pad(dia)}`;
              const eventos = eventosPorFecha[fecha];
              const esHoy = fecha === hoyStr;
              const seleccionado = fecha === diaSeleccionado;
              const enPeriodoActivo = diasActivosDelMes.has(fecha);
              const tieneInicio = eventos?.some((e) => e.tipo === "inicio");
              const tieneFin = eventos?.some((e) => e.tipo === "fin");
              return (
                <button
                  key={fecha}
                  type="button"
                  onClick={() => setDiaSeleccionado(seleccionado ? null : fecha)}
                  title={enPeriodoActivo ? "Hay una campaña corriendo este día" : undefined}
                  style={{
                    position: "relative",
                    aspectRatio: "1",
                    borderRadius: 10,
                    border: esHoy ? "1.5px solid #0877FF" : "1px solid transparent",
                    background: seleccionado ? "#0877FF" : enPeriodoActivo ? "rgba(8,119,255,0.14)" : "transparent",
                    color: seleccionado ? "#fff" : "#0D1629",
                    fontSize: 12.5,
                    fontWeight: esHoy ? 800 : 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {dia}
                  {(tieneInicio || tieneFin) && (
                    <span
                      style={{
                        position: "absolute", bottom: 3, left: "50%", transform: "translateX(-50%)",
                        display: "flex", gap: 2,
                      }}
                    >
                      {tieneInicio && <span style={{ width: 4, height: 4, borderRadius: "50%", background: seleccionado ? "#fff" : "#22C55E" }} />}
                      {tieneFin && <span style={{ width: 4, height: 4, borderRadius: "50%", background: seleccionado ? "#fff" : "#EF4444" }} />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {diaSeleccionado && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "#0D1629", marginBottom: 8 }}>
              {formatoCorto(diaSeleccionado)}
            </div>
            {eventosDelDia.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "#9CA3AF" }}>Sin campañas ese día.</div>
            ) : (
              eventosDelDia.map((evento, i) => (
                <div key={i} className="card" style={{ marginBottom: 8, display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: evento.tipo === "inicio" ? "#22C55E" : "#EF4444" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0D1629" }}>{evento.nombre}</div>
                    <div style={{ fontSize: 11.5, color: "#6B7A99", marginTop: 2 }}>
                      {evento.tipo === "inicio" ? "Empieza" : "Termina"} hoy
                      {modo === "admin" && nombresClientes?.[evento.contrato.cliente_id]
                        ? ` · ${nombresClientes[evento.contrato.cliente_id]}`
                        : ""}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#0D1629", marginBottom: 8 }}>
          Próximos
        </div>
        {proximosEventos.length === 0 ? (
          <div style={{ textAlign: "center", paddingTop: 24, paddingBottom: 24 }}>
            <div style={{ fontSize: 13, color: "#9CA3AF" }}>No hay campañas por empezar o vencer.</div>
          </div>
        ) : (
          proximosEventos.map(({ fecha, evento }, i) => (
            <div key={i} className="card" style={{ marginBottom: 8, display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{
                width: 40, textAlign: "center", flexShrink: 0, fontSize: 11, fontWeight: 800,
                color: evento.tipo === "inicio" ? "#16A34A" : "#DC2626",
              }}>
                {formatoCorto(fecha)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0D1629" }}>{evento.nombre}</div>
                <div style={{ fontSize: 11.5, color: "#6B7A99", marginTop: 2 }}>
                  {evento.tipo === "inicio" ? "Empieza" : "Termina"}
                  {modo === "admin" && nombresClientes?.[evento.contrato.cliente_id]
                    ? ` · ${nombresClientes[evento.contrato.cliente_id]}`
                    : ""}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
