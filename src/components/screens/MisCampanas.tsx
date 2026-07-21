import { useRef, useState, type CSSProperties } from "react";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type { CampanaEstado, Contrato, Panel } from "../../types";
import { estadoCampana, panelesDeContrato } from "../../types";
import { useInformes } from "../../hooks/useInformes";
import { db } from "../../config/firebase";
import { cloudFunctions } from "../../config/firebase";
import { subirEvidenciaR2 } from "../../config/r2";
import { comprimirImagen } from "../../utils/comprimirImagen";
import MobileSidebarButton from "../MobileSidebarButton";
import { campaignCityImage } from "../../utils/campaignCity";
import { formatCampaignName } from "../../utils/campaignName";

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
  onMenuClick?: () => void;
}

const BADGE: Record<string, { bg: string; color: string }> = {
  Activa:    { bg: "rgba(34,197,94,0.15)",  color: "#16A34A" },
  Programada:{ bg: "rgba(8,119,255,0.15)", color: "#0877FF" },
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

export default function MisCampanas({ contratos, paneles, onAbrir, onNueva, isAdmin, clienteId, onMenuClick }: Props) {
  const [filtro, setFiltro] = useState<"Todas"|"Activa"|"Programada"|"Finalizada">("Todas");
  const [modal, setModal] = useState<{ contrato: Contrato; panelNombre: string; estado: RenovacionEstado; solicitudId?: string } | null>(null);
  const [renovadas, setRenovadas] = useState<Set<string>>(new Set());
  const [comprobante, setComprobante] = useState<ComprobanteEstado>("idle");
  const [calificando, setCalificando] = useState<string | null>(null);
  const [hoverEstrella, setHoverEstrella] = useState<{ id: string; n: number } | null>(null);
  const [menuAbiertoId, setMenuAbiertoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [editando, setEditando] = useState<{
    contrato: Contrato;
    nombre: string;
    inicio: string;
    fin: string;
    guardando: boolean;
    error: string;
  } | null>(null);
  // Desactivado temporalmente (a pedido del cliente) -- no borra la
  // funcionalidad, solo la oculta hasta que se pida reactivarla.
  const mostrarCalificacion = false;
  const comprobanteRef = useRef<HTMLInputElement>(null);
  // Siempre en el mismo orden sin importar como vengan del origen:
  // primero las Activas (lo mas urgente/relevante ahora), despues las
  // Programadas (lo que viene), y al final las Finalizadas (ya no
  // requieren accion). Dentro de cada grupo se respeta el orden
  // original (sort estable).
  const ORDEN_ESTADO: Record<CampanaEstado, number> = { Activa: 0, Programada: 1, Finalizada: 2 };
  const filtradas = contratos
    .filter((c) => filtro === "Todas" || estadoCampana(c) === filtro)
    .slice()
    .sort((a, b) => ORDEN_ESTADO[estadoCampana(a)] - ORDEN_ESTADO[estadoCampana(b)]);
  const informesState = useInformes(isAdmin ? clienteId ?? "" : "");
  const mesActual = new Date().toISOString().slice(0, 7);
  const informeDelMes = informesState.status === "ready" ? informesState.informes.find((i) => i.mes === mesActual) : undefined;

  async function eliminarCampana(c: Contrato, panelNombre: string) {
    if (!cloudFunctions || eliminandoId) return;
    const confirmado = window.confirm(`¿Eliminar la campaña de "${panelNombre}"? Se borra el contrato y no se puede deshacer.`);
    if (!confirmado) return;
    setMenuAbiertoId(null);
    setEliminandoId(c.id);
    try {
      const fn = httpsCallable<{ contratoId: string }, { ok: boolean }>(cloudFunctions, "eliminarContrato");
      await fn({ contratoId: c.id });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo eliminar la campaña.");
    } finally {
      setEliminandoId(null);
    }
  }

  function abrirEdicion(c: Contrato, panelNombre: string) {
    setMenuAbiertoId(null);
    setEditando({
      contrato: c,
      nombre: c.nombre || panelNombre,
      inicio: c.inicio,
      fin: c.fin,
      guardando: false,
      error: "",
    });
  }

  async function guardarEdicion() {
    if (!editando || !db) return;
    const nombre = formatCampaignName(editando.nombre);
    if (!nombre) {
      setEditando({ ...editando, error: "Escribe el nombre de la campaña." });
      return;
    }
    if (!editando.inicio || !editando.fin) {
      setEditando({ ...editando, error: "Completa las dos fechas." });
      return;
    }
    if (editando.fin < editando.inicio) {
      setEditando({ ...editando, error: "La fecha de fin no puede ser anterior al inicio." });
      return;
    }
    setEditando({ ...editando, guardando: true, error: "" });
    try {
      await updateDoc(doc(db, "contratos", editando.contrato.id), {
        nombre,
        inicio: editando.inicio,
        fin: editando.fin,
      });
      setEditando(null);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : "No se pudo actualizar la campaña.";
      setEditando({ ...editando, guardando: false, error: mensaje.replace("FirebaseError: ", "") });
    }
  }

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
      const { key: url } = await subirEvidenciaR2(await comprimirImagen(file));
      await updateDoc(doc(db, "solicitudesCampana", modal.solicitudId), {
        comprobantePagoUrl: url,
        comprobantePagoFecha: new Date().toISOString(),
      });
      setComprobante("subido");
    } catch {
      setComprobante("error");
    }
  }

  async function calificar(c: Contrato, estrellas: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!db) return;
    setCalificando(c.id);
    try {
      await updateDoc(doc(db, "contratos", c.id), {
        calificacion: estrellas,
        calificacionFecha: new Date().toISOString(),
      });
    } catch {
      // si falla, las estrellas siguen disponibles para reintentar
    }
    setCalificando(null);
  }

  const whatsappHref = modal
    ? `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(
        `Hola, acabo de solicitar la renovación de "${modal.panelNombre}" desde Vista360 Player. ¿Podemos coordinar el pago?`
      )}`
    : "#";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>
      {/* Header */}
      <div style={{
        background: "#050A12",
        borderBottom: "3px solid #0877FF",
        padding: "calc(24px + env(safe-area-inset-top)) 20px 16px",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="mobile-header-title-group">
            <MobileSidebarButton onClick={onMenuClick} />
            <div style={{ fontSize: 17, fontWeight: 900, color: "#fff" }}>Mis campañas</div>
          </div>
          <button
            type="button"
            onClick={onNueva}
            aria-label="Nueva campaña"
            style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: "#0877FF", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #E5E7EB", flexShrink: 0 }}>
        {(["Todas","Activa","Programada","Finalizada"] as const).map((f) => (
          <div key={f} onClick={() => setFiltro(f)} style={{
            flex: 1, textAlign: "center",
            padding: "12px 6px", fontSize: 13, fontWeight: filtro === f ? 600 : 400,
            color: filtro === f ? "#0877FF" : "#6B7280",
            borderBottom: filtro === f ? "2px solid #0877FF" : "2px solid transparent", cursor: "pointer",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {f === "Activa" ? "Activas" : f === "Programada" ? "Programadas" : f === "Finalizada" ? "Finalizadas" : f}
          </div>
        ))}
      </div>

      {/* List */}
      <div className="mis-campanas-list" style={{ flex: 1, overflowY: "auto", padding: "14px 16px 20px", background: "#F8F9FB" }}>
        {isAdmin && (
          <div className={`mis-campanas-month-status ${informeDelMes ? "is-sent" : "is-pending"}`}>
            {informeDelMes ? (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="m8 12 2.6 2.6L16.5 9" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v6" />
                <path d="M12 17h.01" />
              </svg>
            )}
            <span>
              {informeDelMes
                ? `Informe de ${informeDelMes.mesLabel} enviado correctamente`
                : "Falta generar y enviar el informe de este mes"}
            </span>
          </div>
        )}

        {filtradas.length === 0 && (
          <div className="mis-campanas-empty" style={{ textAlign: "center", color: "#6B7280", fontSize: 14, marginTop: 48 }}>No tienes campañas en esta categoría.</div>
        )}

        {filtradas.map((c, index) => {
          const estado = estadoCampana(c);
          const badge = BADGE[estado] ?? BADGE.Finalizada;
          const pct = progreso(c);
          const idsPanelesCampana = panelesDeContrato(c);
          const panelNombre = idsPanelesCampana.length > 1
            ? idsPanelesCampana.map((id) => paneles[id]?.nombre ?? id).join(" + ")
            : (paneles[c.panel_id]?.nombre ?? c.panel_id);
          // Si el admin le puso nombre a la campaña, ese es el titulo de
          // la tarjeta -- si no, se sigue mostrando el nombre del/los
          // panel(es), como antes.
          const tituloCampana = formatCampaignName(c.nombre || panelNombre);
          const cityStyle = {
            "--campaign-city-image": `url("${campaignCityImage(c.id)}")`,
          } as CSSProperties;
          return (
            <div
              key={c.id}
              className={`premium-campaign-card${filtradas.length % 2 === 1 && index === filtradas.length - 1 ? " premium-campaign-card-last-single" : ""}`}
              style={cityStyle}
              onClick={() => onAbrir(c)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="premium-campaign-kicker">CAMPAÑA PUBLICITARIA</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div className="premium-campaign-title">{tituloCampana}</div>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", background: badge.bg, borderRadius: 6, padding: "2px 8px", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: badge.color }}>{estado}</span>
                </div>
                <div className="premium-campaign-meta">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/></svg>
                  {panelNombre}
                </div>
                <div className="premium-campaign-meta premium-campaign-date">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  {c.inicio} – {c.fin}
                </div>
                {estado !== "Finalizada" && (
                  <div>
                    <div className="premium-campaign-progress">
                      <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#0877FF,#52A5FF)", borderRadius: 4, transition: "width .3s" }} />
                    </div>
                    <div className="premium-campaign-progress-label">{pct}% completado</div>
                  </div>
                )}
                {/* Desactivado (a pedido del cliente) -- al terminar una
                    campaña no debe aparecer ningun mensaje pidiendo
                    calificarla. No se borra la funcionalidad, solo se
                    oculta hasta que se pida reactivarla. */}
                {!isAdmin && estado === "Finalizada" && mostrarCalificacion && (
                  c.calificacion ? (
                    <div style={{ fontSize: 13, marginTop: 4 }}>
                      {"★".repeat(c.calificacion)}{"☆".repeat(5 - c.calificacion)}
                      <span style={{ fontSize: 12, color: "#6B7280", marginLeft: 6 }}>¡Gracias por calificar!</span>
                    </div>
                  ) : (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 11.5, color: "#6B7280", marginBottom: 4 }}>¿Cómo te fue con esta campaña?</div>
                      <div style={{ display: "flex", gap: 4 }}>
                        {[1, 2, 3, 4, 5].map((n) => {
                          const activa = hoverEstrella?.id === c.id ? n <= hoverEstrella.n : false;
                          return (
                            <button
                              key={n}
                              onClick={(e) => calificar(c, n, e)}
                              onMouseEnter={() => setHoverEstrella({ id: c.id, n })}
                              onMouseLeave={() => setHoverEstrella(null)}
                              disabled={calificando === c.id}
                              style={{
                                background: "none", border: "none", fontSize: 22, lineHeight: 1,
                                cursor: calificando === c.id ? "not-allowed" : "pointer", padding: 2,
                                color: "#F59E0B", opacity: calificando === c.id ? 0.5 : 1,
                                transition: "transform 0.1s ease",
                                transform: activa ? "scale(1.15)" : "scale(1)",
                              }}
                            >
                              {activa ? "★" : "☆"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )
                )}
                {!isAdmin && estado === "Activa" && diasParaVencer(c) <= 14 && diasParaVencer(c) >= 0 && (
                  renovadas.has(c.id) ? (
                    <div className="campaign-renewal-sent">
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="m8 12 2.6 2.6L16.5 9" />
                      </svg>
                      <span>Solicitud de renovación enviada</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="campaign-renewal-button"
                      onClick={(e) => abrirConfirmacion(c, panelNombre, e)}
                    >
                      <img
                        className="campaign-renewal-icon"
                        src="/auto-renewal-2-circle-fill-svgrepo-com.svg"
                        alt=""
                        aria-hidden="true"
                        draggable={false}
                      />
                      <span>
                        <small>Vence en {diasParaVencer(c)} día(s)</small>
                        <strong>Solicitar renovación</strong>
                      </span>
                    </button>
                  )
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {isAdmin && (
                  <div style={{ position: "relative" }} onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      className="report-card-menu-btn"
                      aria-label="Opciones de la campaña"
                      onClick={() => setMenuAbiertoId((actual) => (actual === c.id ? null : c.id))}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="1.9" />
                        <circle cx="12" cy="12" r="1.9" />
                        <circle cx="12" cy="19" r="1.9" />
                      </svg>
                    </button>
                    {menuAbiertoId === c.id && (
                      <div className="report-card-menu-dropdown">
                        <button
                          type="button"
                          className="report-card-menu-item neutral"
                          onClick={() => abrirEdicion(c, panelNombre)}
                        >
                          Editar campaña
                        </button>
                        <button
                          type="button"
                          className="report-card-menu-item"
                          onClick={() => void eliminarCampana(c, panelNombre)}
                          disabled={eliminandoId === c.id}
                        >
                          {eliminandoId === c.id ? "Eliminando..." : "Eliminar campaña"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Nueva campaña CTA */}
        <div style={{ textAlign: "center", color: "#6B7280", fontSize: 13, marginTop: 8, marginBottom: 8 }}>
          ¿Quieres lanzar una nueva campaña?
        </div>
        <button onClick={onNueva} style={{
          width: "100%", padding: "14px", background: "#0877FF", color: "#fff", fontWeight: 600,
          fontSize: 15, border: "none", borderRadius: 14, cursor: "pointer", marginBottom: 16,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
          Nueva campaña
        </button>
      </div>

      {editando && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Editar campaña"
          onClick={() => !editando.guardando && setEditando(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 520, background: "rgba(3,7,14,.68)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 18,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%", maxWidth: 470, borderRadius: 20, background: "#FFFFFF",
              boxShadow: "0 28px 70px rgba(2,6,23,.34)", padding: 22,
            }}
          >
            <div style={{ fontSize: 19, fontWeight: 850, color: "#0B1220", marginBottom: 5 }}>
              Editar campaña
            </div>
            <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.45, marginBottom: 20 }}>
              Actualiza el nombre y la vigencia de la campaña.
            </div>

            <label style={{ display: "block", color: "#475569", fontSize: 12, fontWeight: 750, marginBottom: 6 }}>
              Nombre de la campaña
            </label>
            <input
              autoFocus
              value={editando.nombre}
              onChange={(event) => setEditando({ ...editando, nombre: event.target.value, error: "" })}
              disabled={editando.guardando}
              style={{
                width: "100%", boxSizing: "border-box", border: "1.5px solid #DCE3EC",
                borderRadius: 11, padding: "12px 13px", background: "#FFFFFF", color: "#0B1220",
                fontSize: 14, outline: "none", marginBottom: 16,
              }}
            />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <label style={{ color: "#475569", fontSize: 12, fontWeight: 750 }}>
                Fecha de inicio
                <input
                  type="date"
                  value={editando.inicio}
                  onChange={(event) => setEditando({ ...editando, inicio: event.target.value, error: "" })}
                  disabled={editando.guardando}
                  style={{
                    display: "block", width: "100%", boxSizing: "border-box", marginTop: 6,
                    border: "1.5px solid #DCE3EC", borderRadius: 11, padding: "11px 10px",
                    background: "#FFFFFF", color: "#0B1220", fontSize: 13,
                  }}
                />
              </label>
              <label style={{ color: "#475569", fontSize: 12, fontWeight: 750 }}>
                Fecha de fin
                <input
                  type="date"
                  value={editando.fin}
                  onChange={(event) => setEditando({ ...editando, fin: event.target.value, error: "" })}
                  disabled={editando.guardando}
                  style={{
                    display: "block", width: "100%", boxSizing: "border-box", marginTop: 6,
                    border: "1.5px solid #DCE3EC", borderRadius: 11, padding: "11px 10px",
                    background: "#FFFFFF", color: "#0B1220", fontSize: 13,
                  }}
                />
              </label>
            </div>

            {editando.error && (
              <div style={{ color: "#DC2626", background: "#FEF2F2", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, marginTop: 14 }}>
                {editando.error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setEditando(null)}
                disabled={editando.guardando}
                style={{
                  flex: 1, border: "none", borderRadius: 12, padding: 13, background: "#F1F5F9",
                  color: "#334155", fontSize: 14, fontWeight: 750, cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void guardarEdicion()}
                disabled={editando.guardando}
                style={{
                  flex: 1, border: "none", borderRadius: 12, padding: 13,
                  background: editando.guardando ? "#93C5FD" : "#0877FF",
                  color: "#FFFFFF", fontSize: 14, fontWeight: 800,
                  cursor: editando.guardando ? "default" : "pointer",
                }}
              >
                {editando.guardando ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                <div style={{ fontSize: 16, fontWeight: 800, color: "#0B1220", marginBottom: 6 }}>
                  ¿Confirmas la renovación?
                </div>
                <div style={{ fontSize: 13.5, color: "#6B7280", lineHeight: 1.5, marginBottom: 20 }}>
                  Vamos a solicitar renovar <strong style={{ color: "#0B1220" }}>{modal.panelNombre}</strong> por
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
                      flex: 1, padding: "13px", background: "#0877FF", border: "none", borderRadius: 12,
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
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0B1220", marginBottom: 6 }}>
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
                      flex: 1, padding: "13px", background: "#0877FF", border: "none", borderRadius: 12,
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
