import { deleteDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useState } from "react";
import BackChevron from "../BackChevron";
import { db } from "../../config/firebase";
import { useSolicitudesCampana } from "../../hooks/useSolicitudesCampana";
import { useClientesAdmin } from "../../hooks/useClientesAdmin";
import { BrandThumb } from "../BrandThumb";
import { useSignedUrls } from "../../hooks/useSignedUrls";
import type { SolicitudCampana } from "../../types";

interface Props {
  onBack: () => void;
  onCrearCampana?: (clienteId: string) => void;
}

export default function SolicitudesCampana({ onBack, onCrearCampana }: Props) {
  const state = useSolicitudesCampana(true);
  const clientesState = useClientesAdmin();
  const [resolviendo, setResolviendo] = useState<string | null>(null);
  const [seleccionada, setSeleccionada] = useState<SolicitudCampana | null>(null);
  const [menuAbiertoId, setMenuAbiertoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  const clientes = clientesState.status === "ready" ? clientesState.clientes : [];
  const clientePorId = (clienteId: string) => clientes.find((c) => c.id === clienteId);
  const nombreCliente = (clienteId: string) => clientePorId(clienteId)?.empresa ?? "Cliente";

  const solicitudes = state.status === "ready" ? state.solicitudes : [];
  const pendientes = solicitudes.filter((s) => s.estado === "Pendiente");
  const resueltas = solicitudes.filter((s) => s.estado !== "Pendiente");

  const keysAFirmar = solicitudes
    .flatMap((s) => [s.imagenReferencialUrl, s.comprobantePagoUrl])
    .filter((v): v is string => Boolean(v) && !v!.startsWith("http"));
  const urlsFirmadas = useSignedUrls(keysAFirmar);
  const resolverUrl = (valor?: string) => (!valor ? undefined : valor.startsWith("http") ? valor : urlsFirmadas[valor]);

  async function resolver(id: string, estado: "Revisada" | "Rechazada") {
    if (!db) return;
    setResolviendo(id);
    try {
      await updateDoc(doc(db, "solicitudesCampana", id), { estado, estadoActualizadoEn: serverTimestamp() });
      setSeleccionada((actual) => actual?.id === id ? { ...actual, estado } : actual);
    } catch {
      // el estado vuelve a Pendiente solo si falla, no hace falta más feedback aquí
    }
    setResolviendo(null);
  }

  async function eliminarSolicitud(id: string, nombre: string) {
    if (!db || eliminandoId) return;
    const confirmado = window.confirm(`¿Eliminar la solicitud "${nombre}"? No se puede deshacer.`);
    if (!confirmado) return;
    setMenuAbiertoId(null);
    setEliminandoId(id);
    try {
      await deleteDoc(doc(db, "solicitudesCampana", id));
      setSeleccionada((actual) => (actual?.id === id ? null : actual));
    } catch {
      // si falla, el item se queda visible y se puede reintentar
    }
    setEliminandoId(null);
  }

  async function confirmarPago(id: string, confirmado: boolean) {
    if (!db) return;
    setResolviendo(id);
    try {
      await updateDoc(doc(db, "solicitudesCampana", id), { pagoConfirmado: confirmado });
    } catch {
      // sin feedback extra, el botón queda disponible para reintentar
    }
    setResolviendo(null);
  }

  return (
    <div className="admin-tool-screen solicitudes-screen">
      <div className="detail-header">
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Solicitudes de campaña</div>
        <div style={{ width: 32 }} />
      </div>

      <div className="content-area solicitudes-area">
        <div className="card" style={{ background: "rgba(8,119,255,0.12)" }}>
          <div style={{ fontSize: 12.5, color: "#6D28D9", lineHeight: 1.5 }}>
            Lo que tus clientes piden desde su portal. Solo tú ves esta pantalla.
          </div>
        </div>

        {state.status === "loading" && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center" }}>Cargando…</div>
        )}
        {state.status === "error" && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center", color: "var(--red)" }}>
            {state.message}
          </div>
        )}

        {state.status === "ready" && pendientes.length === 0 && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center" }}>
            No hay solicitudes pendientes.
          </div>
        )}

        {pendientes.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {pendientes.map((s) => (
              <div className="card solicitudes-card" key={s.id} onClick={() => setSeleccionada(s)}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                  <BrandThumb name={nombreCliente(s.cliente_id)} avatarKey={clientePorId(s.cliente_id)?.avatarKey} avatarUrl={clientePorId(s.cliente_id)?.avatarUrl} size={40} radius={10} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                      {nombreCliente(s.cliente_id)} — {s.nombre}
                    </div>
                    {s.objetivo && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>🎯 {s.objetivo}</div>
                    )}
                    {s.presupuesto != null && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                        💰 S/ {s.presupuesto.toLocaleString("es-PE")}
                      </div>
                    )}
                    {s.ciudades?.length > 0 && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                        📍 {s.ciudades.join(", ")}
                      </div>
                    )}
                    {s.comentarios && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, fontStyle: "italic" }}>
                        {s.comentarios}
                      </div>
                    )}
                    {s.comprobantePagoUrl && (
                      <a
                        href={resolverUrl(s.comprobantePagoUrl)}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8,
                          fontSize: 12, fontWeight: 600,
                          color: s.pagoConfirmado ? "var(--green)" : "#D97706",
                        }}
                      >
                        📎 Ver comprobante de pago {s.pagoConfirmado ? "· Confirmado ✓" : "· Sin confirmar"}
                      </a>
                    )}
                  </div>
                </div>
                {s.imagenReferencialUrl && (
                  <img
                    src={resolverUrl(s.imagenReferencialUrl)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    style={{ width: "100%", height: 128, objectFit: "cover", borderRadius: 12, marginBottom: 10, display: "block" }}
                  />
                )}
                {s.comprobantePagoUrl && !s.pagoConfirmado && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <button
                      onClick={(event) => { event.stopPropagation(); confirmarPago(s.id, true); }}
                      disabled={resolviendo === s.id}
                      style={{
                        flex: 1, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)",
                        borderRadius: 10, padding: "9px 12px", color: "var(--green)", fontSize: 12.5,
                        fontWeight: 700, cursor: resolviendo === s.id ? "not-allowed" : "pointer",
                      }}
                    >
                      💰 Confirmar pago recibido
                    </button>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={(event) => { event.stopPropagation(); resolver(s.id, "Revisada"); }}
                    disabled={resolviendo === s.id}
                    style={{
                      flex: 1, background: "var(--accent)", border: "none", borderRadius: 10,
                      padding: "10px 12px", color: "#fff", fontSize: 12.5, fontWeight: 700,
                      cursor: resolviendo === s.id ? "not-allowed" : "pointer",
                    }}
                  >
                    {resolviendo === s.id ? "Guardando…" : "✓ Marcar revisada"}
                  </button>
                  <button
                    onClick={(event) => { event.stopPropagation(); resolver(s.id, "Rechazada"); }}
                    disabled={resolviendo === s.id}
                    style={{
                      background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                      borderRadius: 10, padding: "10px 14px", color: "var(--red)", fontSize: 12.5,
                      fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {resueltas.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 20 }}>Historial</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {resueltas.map((s) => (
                <div
                  key={s.id}
                  className="card"
                  onClick={() => setSeleccionada(s)}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    gap: 8, padding: "12px 14px", cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 13, color: "var(--text)", minWidth: 0, flex: 1 }}>
                    {nombreCliente(s.cliente_id)} — {s.nombre}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <div
                      style={{
                        fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                        color: s.estado === "Rechazada" ? "var(--red)" : "var(--green)",
                        background: s.estado === "Rechazada" ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.12)",
                      }}
                    >
                      {s.estado}
                    </div>
                    <div style={{ position: "relative" }} onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        className="report-card-menu-btn"
                        aria-label="Opciones de la solicitud"
                        onClick={() => setMenuAbiertoId((actual) => (actual === s.id ? null : s.id))}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="5" r="1.9" />
                          <circle cx="12" cy="12" r="1.9" />
                          <circle cx="12" cy="19" r="1.9" />
                        </svg>
                      </button>
                      {menuAbiertoId === s.id && (
                        <div className="report-card-menu-dropdown">
                          <button
                            type="button"
                            className="report-card-menu-item"
                            onClick={() => void eliminarSolicitud(s.id, s.nombre)}
                            disabled={eliminandoId === s.id}
                          >
                            {eliminandoId === s.id ? "Eliminando..." : "Eliminar"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {seleccionada && (
        <div className="solicitud-detail-overlay" onClick={() => setSeleccionada(null)}>
          <div className="solicitud-detail-panel" onClick={(event) => event.stopPropagation()}>
            <div className="solicitud-detail-head">
              <div>
                <div className="solicitud-detail-kicker">{nombreCliente(seleccionada.cliente_id)}</div>
                <div className="solicitud-detail-title">{seleccionada.nombre}</div>
              </div>
              <button className="solicitud-detail-close" onClick={() => setSeleccionada(null)}>×</button>
            </div>

            <div className="solicitud-detail-grid">
              <div>
                <span>Estado</span>
                <strong>{seleccionada.estado}</strong>
              </div>
              <div>
                <span>Presupuesto</span>
                <strong>{seleccionada.presupuesto != null ? `S/ ${seleccionada.presupuesto.toLocaleString("es-PE")}` : "Sin definir"}</strong>
              </div>
              <div>
                <span>Ciudades</span>
                <strong>{seleccionada.ciudades?.length ? seleccionada.ciudades.join(", ") : "Sin ciudad"}</strong>
              </div>
              <div>
                <span>Pago</span>
                <strong>{seleccionada.pagoConfirmado ? "Confirmado" : seleccionada.comprobantePagoUrl ? "Por confirmar" : "Sin comprobante"}</strong>
              </div>
            </div>

            {seleccionada.objetivo && (
              <div className="solicitud-detail-text">
                <span>Objetivo</span>
                <p>{seleccionada.objetivo}</p>
              </div>
            )}
            {seleccionada.comentarios && (
              <div className="solicitud-detail-text">
                <span>Comentarios</span>
                <p>{seleccionada.comentarios}</p>
              </div>
            )}
            {seleccionada.imagenReferencialUrl && (
              <a href={resolverUrl(seleccionada.imagenReferencialUrl)} target="_blank" rel="noreferrer" className="solicitud-detail-image">
                <img src={resolverUrl(seleccionada.imagenReferencialUrl)} alt="" />
                <span>Ver imagen de referencia</span>
              </a>
            )}

            <div className="solicitud-detail-actions">
              {seleccionada.comprobantePagoUrl && (
                <a href={resolverUrl(seleccionada.comprobantePagoUrl)} target="_blank" rel="noreferrer" className="solicitud-action secondary">
                  Ver comprobante
                </a>
              )}
              {clientePorId(seleccionada.cliente_id)?.celular && (
                <a
                  href={`https://wa.me/${clientePorId(seleccionada.cliente_id)?.celular?.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola, revisé tu solicitud de campaña "${seleccionada.nombre}" en Vista360 Player. Te escribo para coordinar los detalles.`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="solicitud-action whatsapp"
                >
                  Hablar por WhatsApp
                </a>
              )}
              {seleccionada.estado === "Pendiente" && (
                <button className="solicitud-action secondary" onClick={() => resolver(seleccionada.id, "Revisada")}>
                  Marcar revisada
                </button>
              )}
              <button
                className="solicitud-action primary"
                onClick={() => {
                  setSeleccionada(null);
                  onCrearCampana?.(seleccionada.cliente_id);
                }}
              >
                Crear campaña
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
