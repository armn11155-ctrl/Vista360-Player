import { useRef, useState } from "react";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import type { Contrato, Panel } from "../../types";
import { estadoCampana } from "../../types";
import { useInformes } from "../../hooks/useInformes";
import { BrandThumb } from "../BrandThumb";
import { db } from "../../config/firebase";
import { subirEvidenciaCloudinary } from "../../config/cloudinary";

// TODO: reemplazar por el número real de WhatsApp del negocio (mismo
// placeholder que usa Contactanos.tsx — hay que corregirlo en los dos
// lugares a la vez).
const WHATSAPP_NUMERO = "51999999999";

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

type RenovacionEstado = "idle" | "confirmando" | "enviando" | "enviada" | "error";
type ComprobanteEstado = "idle" | "subiendo" | "subido" | "error";

export default function MisCampanas({ contratos, paneles, clienteNombre, onAbrir, onNueva, isAdmin, clienteId }: Props) {
  const [filtro, setFiltro] = useState<"Todas"|"Activa"|"Programada"|"Finalizada">("Todas");
  const [modal, setModal] = useState<{ contrato: Contrato; panelNombre: string; estado: RenovacionEstado; solicitudId?: string } | null>(null);
  const [renovadas, setRenovadas] = useState<Set<string>>(new Set());
  const [comprobante, setComprobante] = useState<ComprobanteEstado>("idle");
  const comprobanteRef = useRef<HTMLInputElement>(null);
  const filtradas = contratos.filter((c) => filtro === "Todas" || estadoCampana(c) === filtro);
  const informesState = useInformes(isAdmin ? clienteId ?? "" : "");
  const mesActual = new Date().toISOString().slice(0, 7);
  const informeDelMes = informesState.status === "ready" ? informesState.informes.find((i) => i.mes === mesActual) : undefined;

  function abrirConfirmacion(c: Contrato, panelNombre: string, e: React.MouseEvent) {
    e.stopPropagation();
    setComprobante("idle");
    setModal({ contrato: c, panelNombre, estado: "confirmando" });
  }

  async function confirmarRenovacion() {
    if (!modal || !db || !clienteId) return;
    setModal({ ...modal, estado: "enviando" });
    try {
      const ref = await addDoc(collection(db, "solicitudesCampana"), {
        cliente_id: clienteId,
        nombre: `Renovación — ${modal.panelNombre}`,
        objetivo: "Renovar campaña antes de que venza",
        estado: "Pendiente",
        createdAt: serverTimestamp(),
      });
      setRenovadas((prev) => new Set(prev).add(modal.contrato.id));
      setModal({ ...modal, estado: "enviada", solicitudId: ref.id });
    } catch {
      setModal({ ...modal, estado: "error" });
    }
  }

  async function subirComprobante(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !db || !modal?.solicitudId) return;
    setComprobante("subiendo");
    try {
      const url = await subirEvidenciaCloudinary(file);
      await updateDoc(doc(db, "solicitudesCampana", modal.solicitudId), {
        comprobantePagoUrl: url,
        comprobantePagoFecha: new Date().toISOString(),
      });
      setComprobante("subido");
    } catch {
      setComprobante("error");
    }
  }

  const whatsappHref = modal
    ? `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(
        `Hola, acabo de solicitar la renovación de "${modal.panelNombre}" desde Vista360 Player. ¿Podemos coordinar el pago?`
      )}`
    : "#";

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
                      onClick={(e) => abrirConfirmacion(c, panelNombre, e)}
                      style={{
                        marginTop: 8, background: "rgba(245,158,11,0.1)", border: "1px solid #FDE68A",
                        borderRadius: 8, padding: "6px 10px", color: "#B45309", fontSize: 11.5,
                        fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      {`⏰ Vence en ${diasParaVencer(c)} día(s) — Solicitar renovación`}
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

      {/* Modal de confirmación / éxito — en el mismo lugar, sin salir de la pantalla */}
      {modal && (
        <div
          onClick={() => (modal.estado === "confirmando" || modal.estado === "error") && setModal(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(13,22,41,0.55)", zIndex: 500,
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: "20px 20px 0 0", padding: "22px 20px",
              width: "100%", maxWidth: 480, boxShadow: "0 -8px 30px rgba(0,0,0,0.2)",
            }}
          >
            {(modal.estado === "confirmando" || modal.estado === "enviando") && (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#0D1629", marginBottom: 6 }}>
                  ¿Confirmas la renovación?
                </div>
                <div style={{ fontSize: 13.5, color: "#6B7280", lineHeight: 1.5, marginBottom: 20 }}>
                  Vamos a solicitar renovar <strong style={{ color: "#0D1629" }}>{modal.panelNombre}</strong> por
                  un mes más. Nuestro equipo te contactará para coordinar el pago.
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => setModal(null)}
                    disabled={modal.estado === "enviando"}
                    style={{
                      flex: 1, padding: "13px", background: "#F3F4F6", border: "none", borderRadius: 12,
                      color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer",
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmarRenovacion}
                    disabled={modal.estado === "enviando"}
                    style={{
                      flex: 1, padding: "13px", background: "#2563EB", border: "none", borderRadius: 12,
                      color: "#fff", fontWeight: 700, fontSize: 14,
                      cursor: modal.estado === "enviando" ? "not-allowed" : "pointer",
                    }}
                  >
                    {modal.estado === "enviando" ? "Enviando…" : "Confirmar y enviar"}
                  </button>
                </div>
              </>
            )}

            {modal.estado === "enviada" && (
              <>
                <div style={{ textAlign: "center", marginBottom: 6 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: "50%", background: "rgba(34,197,94,0.12)",
                    display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px",
                  }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0D1629", marginBottom: 6 }}>
                    Solicitud enviada
                  </div>
                  <div style={{ fontSize: 13.5, color: "#6B7280", lineHeight: 1.5, marginBottom: 20 }}>
                    Ya la vieron. Puedes escribirnos por WhatsApp <strong>o</strong> adjuntar tu
                    comprobante de pago aquí mismo — lo que te sea más cómodo, las dos formas son válidas.
                  </div>
                </div>
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    width: "100%", padding: "13px", background: "#22C55E", borderRadius: 12,
                    color: "#fff", fontWeight: 700, fontSize: 14, textDecoration: "none", boxSizing: "border-box",
                  }}
                >
                  💬 Escríbenos para coordinar el pago
                </a>

                <div style={{ margin: "12px 0", textAlign: "center", fontSize: 12, color: "#9CA3AF" }}>o, si prefieres</div>

                <input ref={comprobanteRef} type="file" accept="image/*" style={{ display: "none" }} onChange={subirComprobante} />
                {comprobante === "subido" ? (
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    width: "100%", padding: "13px", background: "rgba(34,197,94,0.1)", borderRadius: 12,
                    color: "#16A34A", fontWeight: 700, fontSize: 14,
                  }}>
                    ✓ Comprobante enviado — lo vamos a revisar
                  </div>
                ) : (
                  <button
                    onClick={() => comprobanteRef.current?.click()}
                    disabled={comprobante === "subiendo"}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      width: "100%", padding: "13px", background: "#F3F4F6", border: "1px dashed #D1D5DB",
                      borderRadius: 12, color: "#374151", fontWeight: 600, fontSize: 14,
                      cursor: comprobante === "subiendo" ? "not-allowed" : "pointer",
                    }}
                  >
                    {comprobante === "subiendo" ? "Subiendo…" : "📎 Ya pagué — adjuntar captura de Yape/Plin"}
                  </button>
                )}
                {comprobante === "error" && (
                  <div style={{ fontSize: 12, color: "#DC2626", textAlign: "center", marginTop: 6 }}>
                    No se pudo subir el comprobante. Intenta de nuevo.
                  </div>
                )}

                <button
                  onClick={() => setModal(null)}
                  style={{
                    width: "100%", padding: "12px", background: "none", border: "none",
                    color: "#6B7280", fontWeight: 600, fontSize: 13.5, cursor: "pointer", marginTop: 4,
                  }}
                >
                  Listo, cerrar
                </button>
              </>
            )}

            {modal.estado === "error" && (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#DC2626", marginBottom: 6 }}>
                  No se pudo enviar
                </div>
                <div style={{ fontSize: 13.5, color: "#6B7280", lineHeight: 1.5, marginBottom: 20 }}>
                  Revisa tu conexión e intenta de nuevo, o escríbenos directo.
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => setModal(null)}
                    style={{
                      flex: 1, padding: "13px", background: "#F3F4F6", border: "none", borderRadius: 12,
                      color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer",
                    }}
                  >
                    Cerrar
                  </button>
                  <button
                    onClick={confirmarRenovacion}
                    style={{
                      flex: 1, padding: "13px", background: "#2563EB", border: "none", borderRadius: 12,
                      color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
                    }}
                  >
                    Reintentar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
