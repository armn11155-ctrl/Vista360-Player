import BackChevron from "../BackChevron";
import { useFacturas } from "../../hooks/useFacturas";
import type { Factura, FacturaEstado } from "../../types";

interface Props {
  ruc: string | undefined;
  onBack: () => void;
}

const FACTURACION_WEB_URL = "https://facturacion-web-abi.pages.dev";

const BADGE: Record<FacturaEstado, { bg: string; color: string }> = {
  Pagada:    { bg: "rgba(34,197,94,0.15)",  color: "#16A34A" },
  Aceptada:  { bg: "rgba(34,197,94,0.15)",  color: "#16A34A" },
  Emitida:   { bg: "rgba(59,130,246,0.15)", color: "#2563EB" },
  Pendiente: { bg: "rgba(245,158,11,0.15)", color: "#D97706" },
  Vencida:   { bg: "rgba(239,68,68,0.15)",  color: "#DC2626" },
  Rechazada: { bg: "rgba(239,68,68,0.15)",  color: "#DC2626" },
  Anulada:   { bg: "rgba(107,114,128,0.12)",color: "#6B7280" },
  Borrador:  { bg: "rgba(107,114,128,0.12)",color: "#6B7280" },
};

function fmtMonto(f: Factura): string {
  const monto = (f.total ?? 0).toLocaleString("es-PE", { minimumFractionDigits: 2 });
  return `${f.moneda === "USD" ? "US$" : "S/"} ${monto}`;
}

export default function Facturas({ ruc, onBack }: Props) {
  const state = useFacturas(ruc);
  const facturas = state.status === "ready" ? state.facturas : [];

  return (
    <div>
      <div className="detail-header">
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Facturas</div>
        <div style={{ width: 32 }} />
      </div>

      <div className="content-area">
        {!ruc && (
          <div className="card" style={{ background: "rgba(245,158,11,0.1)" }}>
            <div style={{ fontSize: 12.5, color: "#B45309", lineHeight: 1.5 }}>
              No encontramos un RUC registrado para tu cuenta — contáctanos para vincularlo y
              poder mostrarte tus facturas aquí.
            </div>
          </div>
        )}

        {state.status === "loading" && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center" }}>Cargando…</div>
        )}
        {state.status === "error" && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center", color: "var(--red)" }}>
            {state.message}
          </div>
        )}
        {state.status === "ready" && ruc && facturas.length === 0 && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center" }}>
            Aún no tienes facturas registradas.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {facturas.map((f) => {
            const badge = BADGE[f.estado] ?? BADGE.Borrador;
            return (
              <a
                key={f.id}
                href={`${FACTURACION_WEB_URL}/ver/${f.id}`}
                target="_blank"
                rel="noreferrer"
                className="card"
                style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                    {f.tipo_doc ?? "Factura"} {f.numero_fmt ?? f.serie}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {f.fecha_emision ?? "—"} · {fmtMonto(f)}
                  </div>
                  <span style={{
                    display: "inline-block", marginTop: 6, fontSize: 12, fontWeight: 700,
                    padding: "2px 8px", borderRadius: 20, background: badge.bg, color: badge.color,
                  }}>
                    {f.estado}
                  </span>
                </div>
                <span style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600, flexShrink: 0 }}>
                  Ver →
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
