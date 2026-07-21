import { deleteDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useState } from "react";
import BackChevron from "../BackChevron";
import { db } from "../../config/firebase";
import { useSolicitudesCampana } from "../../hooks/useSolicitudesCampana";
import { useClientesAdmin } from "../../hooks/useClientesAdmin";
import { BrandThumb } from "../BrandThumb";
import { useSignedUrls } from "../../hooks/useSignedUrls";
import type { SolicitudCampana } from "../../types";

// Iconos en vez de emojis (se pidió que no queden emojis en la
// pantalla de solicitudes) -- Target y Pin son los SVG que mandó el
// admin, recoloreados a fill="currentColor" para heredar el color del
// texto de al lado. Money y Paperclip no tenían un SVG propio, así que
// se usan los íconos de línea estándar (mismo estilo stroke que ya usa
// el resto del portal, ej. los botones de ReportCard).
function TargetIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M204.762,254.456l34.212-34.204c-39.807-18.293-88.544-11.079-121.29,21.675
        c-42.013,42.006-42.013,110.372,0,152.393c42.005,42.014,110.38,42.014,152.386,0c32.746-32.745,39.968-81.49,21.675-121.298
        l-34.211,34.211c3.381,19.976-2.553,41.224-17.939,56.604c-25.21,25.218-66.225,25.218-91.434,0
        c-25.21-25.21-25.21-66.224,0-91.427C163.546,257.016,184.794,251.074,204.762,254.456z" />
      <path d="M323.628,241.146c34.324,57.876,26.642,133.939-23.076,183.65c-58.826,58.826-154.527,58.826-213.345,0
        c-58.826-58.817-58.826-154.527,0-213.352c49.703-49.711,125.775-57.393,183.65-23.076l31.216-31.225
        c-75.387-50.693-178.754-42.77-245.35,23.817c-75.629,75.621-75.629,198.69,0,274.311c75.63,75.638,198.683,75.638,274.312,0
        c66.603-66.595,74.518-169.962,23.809-245.358L323.628,241.146z" />
      <path d="M511.279,84.84c-1.61-4.195-5.684-6.78-10.298-6.57l-70.565,3.31l3.318-70.556
        c0.201-4.622-2.384-8.68-6.578-10.306c-4.17-1.61-9.122-0.451-12.52,2.931l-75.299,75.306l-3.809,81.322L198.634,297.162
        c-6.964-1.578-14.565,0.29-19.992,5.716c-8.422,8.422-8.422,22.062,0,30.484c8.414,8.422,22.062,8.422,30.484,0
        c5.418-5.427,7.295-13.028,5.716-20l136.886-136.894l81.314-3.8l75.307-75.316C511.739,93.963,512.89,89.026,511.279,84.84z" />
    </svg>
  );
}

function PinIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-3 0 20 20" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M174,5248.219 C172.895,5248.219 172,5247.324 172,5246.219 C172,5245.114 172.895,5244.219 174,5244.219
        C175.105,5244.219 176,5245.114 176,5246.219 C176,5247.324 175.105,5248.219 174,5248.219 M174,5239
        C170.134,5239 167,5242.134 167,5246 C167,5249.866 174,5259 174,5259 C174,5259 181,5249.866 181,5246
        C181,5242.134 177.866,5239 174,5239" transform="translate(-167, -5239)" />
    </svg>
  );
}

function MoneyIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function PaperclipIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

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
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}>
                        <TargetIcon /> <span>{s.objetivo}</span>
                      </div>
                    )}
                    {s.presupuesto != null && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
                        <MoneyIcon /> <span>S/ {s.presupuesto.toLocaleString("es-PE")}</span>
                      </div>
                    )}
                    {s.ciudades?.length > 0 && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
                        <PinIcon /> <span>{s.ciudades.join(", ")}</span>
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
                        <PaperclipIcon /> Ver comprobante de pago {s.pagoConfirmado ? "· Confirmado ✓" : "· Sin confirmar"}
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
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><MoneyIcon /> Confirmar pago recibido</span>
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
