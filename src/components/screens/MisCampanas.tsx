import { useState } from "react";
import type { Contrato, Panel } from "../../types";
import { estadoCampana } from "../../types";
import { useInformes } from "../../hooks/useInformes";

interface Props {
  contratos: Contrato[];
  paneles: Record<string, Panel>;
  onAbrir: (contrato: Contrato) => void;
  onNueva: () => void;
  /** Solo visible para la cuenta admin: si ya se envió el informe del mes. */
  isAdmin?: boolean;
  clienteId?: string;
}

const BADGE_STYLE: Record<string, { bg: string; color: string }> = {
  Activa: { bg: "#D1FAE5", color: "#059669" },
  Programada: { bg: "#DBEAFE", color: "#2563EB" },
  Finalizada: { bg: "#F3F4F6", color: "#6B7280" },
};

function progreso(c: Contrato): number {
  const inicio = new Date(c.inicio).getTime();
  const fin = new Date(c.fin).getTime();
  const hoy = Date.now();
  if (hoy <= inicio) return 0;
  if (hoy >= fin) return 100;
  return Math.round(((hoy - inicio) / (fin - inicio)) * 100);
}

export default function MisCampanas({ contratos, paneles, onAbrir, onNueva, isAdmin, clienteId }: Props) {
  const [filtro, setFiltro] = useState<"Todas" | "Activa" | "Programada" | "Finalizada">("Todas");

  const filtradas = contratos.filter((c) => filtro === "Todas" || estadoCampana(c) === filtro);

  const informesState = useInformes(isAdmin ? clienteId ?? "" : "");
  const mesActual = new Date().toISOString().slice(0, 7);
  const informeDelMes =
    informesState.status === "ready" ? informesState.informes.find((i) => i.mes === mesActual) : undefined;

  return (
    <div style={{ background: "#F0F2F7", display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ background: "#fff", padding: "16px 20px", display: "flex", justifyContent: "center", boxShadow: "0 1px 0 #F3F4F6", flexShrink: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#111827" }}>Mis campañas</div>
      </div>

      <div style={{ background: "#fff", display: "flex", padding: "0 6px", borderBottom: "1px solid #F3F4F6", flexShrink: 0 }}>
        {(["Todas", "Activa", "Programada", "Finalizada"] as const).map((f) => (
          <div
            key={f}
            onClick={() => setFiltro(f)}
            style={{
              padding: "12px 14px",
              fontSize: 13,
              fontWeight: filtro === f ? 600 : 500,
              color: filtro === f ? "#2563EB" : "#9CA3AF",
              borderBottom: filtro === f ? "2px solid #2563EB" : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            {f === "Activa" ? "Activas" : f === "Programada" ? "Programadas" : f === "Finalizada" ? "Finalizadas" : f}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 0" }}>
        {isAdmin && (
          <div
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: informeDelMes ? "#F0FDF4" : "#FFF7ED",
              border: `1px solid ${informeDelMes ? "#BBF7D0" : "#FED7AA"}`,
              borderRadius: 12, padding: "10px 12px", marginBottom: 14, fontSize: 12,
              color: informeDelMes ? "#166534" : "#9A3412",
            }}
          >
            {informeDelMes
              ? `✅ Informe de ${informeDelMes.mesLabel} ya enviado a este cliente`
              : "⏳ El informe de este mes todavía no se ha generado (se envía solo el día 1)"}
          </div>
        )}
        {filtradas.length === 0 && (
          <div className="state-sub" style={{ marginTop: 40 }}>No tienes campañas en esta categoría.</div>
        )}
        {filtradas.map((c) => {
          const estado = estadoCampana(c);
          const badge = BADGE_STYLE[estado];
          const panelNombres = Array.from(new Set([c.panel_id].map((id) => paneles[id]?.nombre ?? id)));
          return (
            <div
              key={c.id}
              onClick={() => onAbrir(c)}
              style={{
                background: "#fff", borderRadius: 16, padding: 14, marginBottom: 12,
                display: "flex", gap: 13, alignItems: "flex-start",
                boxShadow: "0 2px 8px rgba(0,0,0,0.07)", cursor: "pointer",
              }}
            >
              <div style={{ width: 56, height: 56, borderRadius: 12, background: "#0D1629", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12 }}>
                {c.cara ?? "🏙️"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 5 }}>
                  Contrato #{c.id.slice(0, 6)}
                </div>
                <div style={{ display: "inline-block", background: badge.bg, color: badge.color, padding: "2px 9px", borderRadius: 6, fontSize: 11, fontWeight: 600, marginBottom: 7 }}>
                  {estado}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#6B7280", marginBottom: 3 }}>
                  📍 {panelNombres.join(", ")}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#6B7280", marginBottom: 8 }}>
                  📅 {c.inicio} – {c.fin}
                </div>
                {estado === "Activa" && (
                  <>
                    <div style={{ background: "#E5E7EB", borderRadius: 4, height: 6, overflow: "hidden" }}>
                      <div style={{ width: `${progreso(c)}%`, height: "100%", background: "linear-gradient(90deg,#2563EB,#60A5FA)", borderRadius: 4 }} />
                    </div>
                    <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 3 }}>{progreso(c)}% completado</div>
                  </>
                )}
              </div>
              <div style={{ color: "#D1D5DB", fontSize: 20, marginTop: 2, flexShrink: 0 }}>›</div>
            </div>
          );
        })}
      </div>

      <div style={{ background: "#F0F2F7", padding: "10px 14px 14px", flexShrink: 0 }}>
        <div style={{ textAlign: "center", fontSize: 12, color: "#9CA3AF", marginBottom: 10 }}>
          ¿Quieres lanzar una nueva campaña?
        </div>
        <button className="btn-primary" onClick={onNueva}>+ Nueva campaña</button>
      </div>
    </div>
  );
}
