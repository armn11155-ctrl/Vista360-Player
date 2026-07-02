import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import type { Contrato, Panel } from "../../types";
import { estadoCampana } from "../../types";
import { useInformes } from "../../hooks/useInformes";
import { BrandThumb } from "../BrandThumb";
import { db } from "../../config/firebase";

interface Props {
  contratos: Contrato[];
  paneles: Record<string, Panel>;
  clienteNombre: string;
  onAbrir: (contrato: Contrato) => void;
  onNueva: () => void;
  isAdmin?: boolean;
  clienteId?: string;
}

const BADGE: Record<string, { bg: string; color: string }> = {
  Activa:    { bg: "rgba(34,197,94,0.15)",  color: "#16A34A" },
  Programada:{ bg: "rgba(59,130,246,0.15)", color: "#2563EB" },
  Finalizada:{ bg: "rgba(107,114,128,0.12)",color: "#6B7280" },
};

function progreso(c: Contrato): number {
  const s = new Date(c.inicio).getTime(), e = new Date(c.fin).getTime(), n = Date.now();
  if (n <= s) return 0; if (n >= e) return 100;
  return Math.round(((n - s) / (e - s)) * 100);
}

function diasParaVencer(c: Contrato): number {
  return Math.ceil((new Date(c.fin).getTime() - Date.now()) / 86400000);
}

export default function MisCampanas({ contratos, paneles, clienteNombre, onAbrir, onNueva, isAdmin, clienteId }: Props) {
  const [filtro, setFiltro] = useState<"Todas"|"Activa"|"Programada"|"Finalizada">("Todas");
  const [renovando, setRenovando] = useState<string | null>(null);
  const [renovadas, setRenovadas] = useState<Set<string>>(new Set());
  const filtradas = contratos.filter((c) => filtro === "Todas" || estadoCampana(c) === filtro);
  const informesState = useInformes(isAdmin ? clienteId ?? "" : "");
  const mesActual = new Date().toISOString().slice(0, 7);
  const informeDelMes = informesState.status === "ready" ? informesState.informes.find((i) => i.mes === mesActual) : undefined;

  async function solicitarRenovacion(c: Contrato, panelNombre: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!db || !clienteId) return;
    setRenovando(c.id);
    try {
      await addDoc(collection(db, "solicitudesCampana"), {
        cliente_id: clienteId,
        nombre: `Renovación — ${panelNombre}`,
        objetivo: "Renovar campaña antes de que venza",
        estado: "Pendiente",
        createdAt: serverTimestamp(),
      });
      setRenovadas((prev) => new Set(prev).add(c.id));
    } catch {
      // si falla, el botón sigue disponible para reintentar
    }
    setRenovando(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>
      {/* Header */}
      <div style={{ background: "#0D1629", padding: "16px 20px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>Mis campañas</div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #E5E7EB", flexShrink: 0 }}>
        {(["Todas","Activa","Programada","Finalizada"] as const).map((f) => (
          <div key={f} onClick={() => setFiltro(f)} style={{
            padding: "12px 14px", fontSize: 13, fontWeight: filtro === f ? 600 : 400,
            color: filtro === f ? "#2563EB" : "#6B7280",
            borderBottom: filtro === f ? "2px solid #2563EB" : "2px solid transparent", cursor: "pointer",
          }}>
            {f === "Activa" ? "Activas" : f === "Programada" ? "Programadas" : f === "Finalizada" ? "Finalizadas" : f}
          </div>
        ))}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 0", background: "#F8F9FB" }}>
        {isAdmin && (
          <div style={{
            background: informeDelMes ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)",
            border: `1px solid ${informeDelMes ? "#BBF7D0" : "#FDE68A"}`,
            borderRadius: 12, padding: "10px 12px", marginBottom: 14, fontSize: 12,
            color: informeDelMes ? "#16A34A" : "#B45309",
          }}>
            {informeDelMes ? `✅ Informe de ${informeDelMes.mesLabel} ya enviado` : "⏳ El informe de este mes todavía no se ha generado"}
          </div>
        )}

        {filtradas.length === 0 && (
          <div style={{ textAlign: "center", color: "#6B7280", fontSize: 14, marginTop: 48 }}>No tienes campañas en esta categoría.</div>
        )}

        {filtradas.map((c) => {
          const estado = estadoCampana(c);
          const badge = BADGE[estado] ?? BADGE.Finalizada;
          const pct = progreso(c);
          const panelNombre = paneles[c.panel_id]?.nombre ?? c.panel_id;
          return (
            <div key={c.id} onClick={() => onAbrir(c)} style={{
              background: "#fff", borderRadius: 16, padding: 14, marginBottom: 12,
              boxShadow: "0 1px 4px rgba(0,0,0,0.07)", cursor: "pointer", display: "flex", gap: 13, alignItems: "flex-start",
            }}>
              <BrandThumb name={clienteNombre || panelNombre} size={72} radius={12} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#0D1629" }}>{panelNombre}</div>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", background: badge.bg, borderRadius: 6, padding: "2px 8px", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: badge.color }}>{estado}</span>
                </div>
                <div style={{ fontSize: 12, color: "#6B7280", display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/></svg>
                  {panelNombre}
                </div>
                <div style={{ fontSize: 12, color: "#6B7280", display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  {c.inicio} – {c.fin}
                </div>
                {estado !== "Finalizada" && (
                  <div>
                    <div style={{ height: 4, background: "#E5E7EB", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: "#2563EB", borderRadius: 4, transition: "width .3s" }} />
                    </div>
                    <div style={{ fontSize: 11, color: "#6B7280", marginTop: 3 }}>{pct}% completado</div>
                  </div>
                )}
                {!isAdmin && estado === "Activa" && diasParaVencer(c) <= 14 && diasParaVencer(c) >= 0 && (
                  renovadas.has(c.id) ? (
                    <div style={{ marginTop: 8, fontSize: 11.5, color: "#16A34A", fontWeight: 600 }}>
                      ✓ Solicitud de renovación enviada
                    </div>
                  ) : (
                    <button
                      onClick={(e) => solicitarRenovacion(c, panelNombre, e)}
                      disabled={renovando === c.id}
                      style={{
                        marginTop: 8, background: "rgba(245,158,11,0.1)", border: "1px solid #FDE68A",
                        borderRadius: 8, padding: "6px 10px", color: "#B45309", fontSize: 11.5,
                        fontWeight: 700, cursor: renovando === c.id ? "not-allowed" : "pointer",
                      }}
                    >
                      {renovando === c.id
                        ? "Enviando…"
                        : `⏰ Vence en ${diasParaVencer(c)} día(s) — Solicitar renovación`}
                    </button>
                  )
                )}
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" style={{ marginTop: 4, flexShrink: 0 }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          );
        })}

        {/* Nueva campaña CTA */}
        <div style={{ textAlign: "center", color: "#6B7280", fontSize: 13, marginTop: 8, marginBottom: 8 }}>
          ¿Quieres lanzar una nueva campaña?
        </div>
        <button onClick={onNueva} style={{
          width: "100%", padding: "14px", background: "#2563EB", color: "#fff", fontWeight: 600,
          fontSize: 15, border: "none", borderRadius: 14, cursor: "pointer", marginBottom: 16,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
          Nueva campaña
        </button>
      </div>
    </div>
  );
}
