import { useState, type CSSProperties } from "react";
import { httpsCallable } from "firebase/functions";
import type { Cliente, Contrato, Panel } from "../../types";
import { estadoCampana, panelesDeContrato } from "../../types";
import { diasHasta, fechaCorta, fechaLarga, hoyEnPeru, soloFecha, sumarDias } from "../../utils/fechas";
import { useInformes } from "../../hooks/useInformes";
import { ReportCard } from "../ReportCard";
import { campaignCityImageHero } from "../../utils/campaignCity";
import { formatCampaignName } from "../../utils/campaignName";
import { agruparPorMes, etiquetaMes } from "../../utils/informesGrouping";
import { cloudFunctions } from "../../config/firebase";
import { mensajeDeError } from "../../utils/errores";
import { descargarRecordatorioCalendario } from "../../utils/calendarioIcs";
import { useDialogos } from "../DialogosProvider";

interface Props {
  contrato: Contrato;
  /** Mapa id -> Panel de TODOS los paneles conocidos -- se busca acá
   *  adentro la lista completa de paneles de este contrato (puede ser
   *  uno o varios, ver panelesDeContrato), en vez de recibir un solo
   *  panel ya resuelto como antes. */
  paneles: Record<string, Panel>;
  clienteNombre: string;
  cliente: Cliente | null;
  onBack: () => void;
  onUpdated: (cambios: Pick<Contrato, "nombre" | "inicio" | "fin">) => void;
  isAdmin: boolean;
}

type TabId = "resumen" | "reportes";

function Badge({ estado }: { estado: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    Activa:     { bg: "rgba(34,197,94,0.15)",  color: "#16A34A" },
    Programada: { bg: "rgba(8,119,255,0.15)", color: "#0877FF" },
    Finalizada: { bg: "rgba(107,114,128,0.12)",color: "#64748B" },
  };
  const s = map[estado] ?? map.Finalizada;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", background: s.bg, color: s.color, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>
      {estado}
    </span>
  );
}

function HeaderIcon({ type }: { type: "calendar" | "pin" }) {
  const common = {
    width: 13,
    height: 13,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg {...common} aria-hidden="true">
      {type === "calendar" ? (
        <>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </>
      ) : (
        <>
          <path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" />
          <circle cx="12" cy="10" r="2.4" />
        </>
      )}
    </svg>
  );
}

function EmptyReportsIcon() {
  return (
    <svg width="42" height="42" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="7" y="8" width="34" height="32" rx="7" fill="#EEF4FF" />
      <path d="M14 31l7-8 6 6 4-5 4 7" stroke="#0877FF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="17" r="3" fill="#93C5FD" />
      <rect x="7" y="8" width="34" height="32" rx="7" stroke="#BFDBFE" strokeWidth="2" />
    </svg>
  );
}

function CampaignLocationMap({ panel }: { panel: Panel }) {
  const googleMapsUrl = `https://www.google.com/maps?q=${panel.lat},${panel.lng}&z=17&output=embed`;

  return (
    <div className="campaign-location-map">
      <iframe
        className="campaign-location-google-frame"
        src={googleMapsUrl}
        title={`Ubicación de ${panel.nombre} en Google Maps`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
    </div>
  );
}

export default function DetalleCampana({ contrato, paneles, clienteNombre: _clienteNombre, cliente, onBack, onUpdated, isAdmin }: Props) {
  const { confirmar, avisar } = useDialogos();
  const [tab, setTab] = useState<TabId>("resumen");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [editando, setEditando] = useState<{
    nombre: string;
    inicio: string;
    fin: string;
    guardando: boolean;
    error: string;
  } | null>(null);

  const estado = estadoCampana(contrato);
  const diasParaVencer = diasHasta(contrato.fin);
  const etiquetaVencimiento = estado === "Finalizada"
    ? "Campaña finalizada"
    : diasParaVencer === 0
      ? "Vence hoy"
      : diasParaVencer === 1
        ? "Vence mañana"
        : `Vence en ${diasParaVencer} días`;

  // Uno o varios paneles segun sea una campaña normal o multi-panel.
  const panelesContrato = panelesDeContrato(contrato).map((id) => paneles[id]).filter((p): p is Panel => !!p);
  const panel = panelesContrato[0];
  const nombrePaneles = panelesContrato.length > 0
    ? panelesContrato.map((p) => p.nombre).join(" + ")
    : `Panel ${contrato.panel_id.slice(0, 6)}`;
  // Si el admin le puso nombre a la campaña, ese es el titulo -- si no
  // (campañas viejas, o cuando no se puso), se sigue mostrando el
  // nombre del/los panel(es) como titulo, como antes.
  const tituloCampana = formatCampaignName(contrato.nombre || nombrePaneles);
  const cityStyle = {
    "--campaign-city-image": `url("${campaignCityImageHero(contrato.id)}")`,
  } as CSSProperties;

  // ── Solicitar renovación directo desde el detalle ──
  // Mismo flujo (y misma Cloud Function, crearSolicitudCampana) que
  // ya existe en MisCampanas.tsx -- antes solo se podía pedir desde
  // la lista, así que si la persona ya estaba viendo el detalle de
  // la campaña tenía que volver atrás para encontrar el botón. Solo
  // para clientes (isAdmin=false): el Gerente no "solicita" sus
  // propias renovaciones, las aprueba.
  const [renovacion, setRenovacion] = useState<"idle" | "enviando" | "enviada" | "error">("idle");
  const [errorRenovacion, setErrorRenovacion] = useState("");
  const puedeRenovar = !isAdmin && estado === "Activa" && diasHasta(contrato.fin) <= 14 && diasHasta(contrato.fin) >= 0;

  async function solicitarRenovacion() {
    if (!cloudFunctions) { setErrorRenovacion("Sin conexión. Intenta de nuevo."); setRenovacion("error"); return; }
    const confirmado = await confirmar({
      titulo: "¿Solicitar la renovación?",
      mensaje: `Se enviará una solicitud para renovar "${tituloCampana}". El equipo de Vista360 se pondrá en contacto contigo.`,
      textoConfirmar: "Solicitar",
    });
    if (!confirmado) return;
    setRenovacion("enviando");
    setErrorRenovacion("");
    try {
      const finActual = soloFecha(contrato.fin);
      const inicioSugerido = finActual ? sumarDias(finActual, 1) : hoyEnPeru();
      const ciudadCampana = panel?.ciudad ?? "";
      const fn = httpsCallable<
        {
          clienteId: string; nombre: string; ciudades: string[]; comentarios: string;
          fechaInicioDeseada: string; fechaFinDeseada: string | null;
        },
        { ok: boolean; id: string; yaExistia?: boolean }
      >(cloudFunctions, "crearSolicitudCampana");
      await fn({
        clienteId: contrato.cliente_id,
        nombre: `Renovación — ${nombrePaneles}`,
        ciudades: ciudadCampana ? [ciudadCampana] : [],
        comentarios: `Renovación de la campaña en el panel "${nombrePaneles}"${ciudadCampana ? ` (${ciudadCampana})` : ""}, que vence el ${finActual}.`,
        fechaInicioDeseada: inicioSugerido,
        fechaFinDeseada: null,
      });
      setRenovacion("enviada");
    } catch (error) {
      setErrorRenovacion(mensajeDeError(error, "No se pudo enviar la solicitud."));
      setRenovacion("error");
    }
  }

  // ── Recordatorio de vencimiento al calendario ──
  // Se genera un .ics acá mismo, en el navegador -- no depende de
  // ningún servidor, funciona con Google Calendar, Apple Calendar y
  // Outlook por igual.
  function agregarRecordatorio() {
    descargarRecordatorioCalendario({
      fecha: soloFecha(contrato.fin),
      titulo: `Vence campaña: ${tituloCampana}`,
      descripcion: `La campaña "${tituloCampana}" en ${nombrePaneles} vence este día. Coordina la renovación con Vista360 (947 957 971) si quieres seguir al aire.`,
      nombreArchivo: `vencimiento-${contrato.id}`,
    });
  }

  function abrirEdicion() {
    setMenuAbierto(false);
    setEditando({
      nombre: contrato.nombre || nombrePaneles,
      inicio: contrato.inicio,
      fin: contrato.fin,
      guardando: false,
      error: "",
    });
  }

  async function guardarEdicion() {
    if (!editando || !cloudFunctions) return;
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
      const fn = httpsCallable<
        { contratoId: string; nombre: string; inicio: string; fin: string },
        { ok: boolean }
      >(cloudFunctions, "actualizarContrato");
      await fn({ contratoId: contrato.id, nombre, inicio: editando.inicio, fin: editando.fin });
      onUpdated({ nombre, inicio: editando.inicio, fin: editando.fin });
      setEditando(null);
    } catch (error) {
      setEditando({ ...editando, guardando: false, error: mensajeDeError(error, "No se pudo actualizar la campaña.") });
    }
  }

  async function eliminarCampana() {
    if (!cloudFunctions || eliminando) return;
    setMenuAbierto(false);
    const confirmado = await confirmar({
      titulo: "¿Eliminar esta campaña?",
      mensaje: `Se borrará el contrato de "${tituloCampana}". No se puede deshacer.`,
      textoConfirmar: "Eliminar",
      destructivo: true,
    });
    if (!confirmado) return;
    setEliminando(true);
    try {
      const fn = httpsCallable<{ contratoId: string }, { ok: boolean; pendiente?: boolean }>(cloudFunctions, "eliminarContrato");
      const res = await fn({ contratoId: contrato.id });
      if (res.data.pendiente) {
        await avisar({
          titulo: "Enviado para aprobación",
          mensaje: `Tu Gerente debe aprobar la eliminación de "${tituloCampana}".`,
        });
        setEliminando(false);
        return;
      }
      onBack();
    } catch (error) {
      await avisar({
        titulo: "No se pudo eliminar la campaña",
        mensaje: mensajeDeError(error, "Vuelve a intentarlo en un momento."),
        esError: true,
      });
      setEliminando(false);
    }
  }
  // PDF del reporte mensual del cliente (el mismo que se ve en la
  // pantalla de Reportes) — se muestra tambien aca para no tener que
  // salir de la campaña a buscarlo.
  // No listar ni firmar reportes mientras la persona sigue en Resumen.
  // Esa pestaña es la entrada por defecto y no usa ningún dato del
  // histórico; pedirlo acá hacía trabajo de red y lecturas invisibles.
  const informesState = useInformes(tab === "reportes" ? contrato.cliente_id : "");
  // Solo los reportes de ESTA campaña -- useInformes trae todos los del
  // cliente juntos (para la pantalla Reportes.tsx), pero acá antes se
  // mostraban sin filtrar y aparecía la lista completa de reportes del
  // cliente en cualquier campaña que abrieras. contratoId lo guarda
  // generarReporteCliente.ts desde que el reporte se genera por
  // campaña -- reportes viejos sin ese dato no van a aparecer acá (sí
  // siguen viéndose en la pantalla Reportes.tsx general).
  const informes = informesState.status === "ready"
    ? informesState.informes.filter((i) => i.contratoId === contrato.id)
    : [];
  const TABS: { id: TabId; label: string }[] = [
    { id: "resumen",    label: "Resumen" },
    { id: "reportes",   label: "Reportes" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8F9FB" }}>

      {/* Header */}
      <div className="campaign-detail-hero" style={{ ...cityStyle, padding: "calc(22px + env(safe-area-inset-top)) 20px 18px", flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <div className="campaign-detail-toolbar">
          <button type="button" onClick={onBack} style={{ background: "none", border: "none", padding: 6, marginLeft: -6, cursor: "pointer", display: "flex" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Detalle de campaña</div>
          {isAdmin ? (
            <div className="campaign-detail-actions">
              <button
                type="button"
                className="campaign-detail-menu-button"
                aria-label="Opciones de campaña"
                aria-haspopup="menu"
                aria-expanded={menuAbierto}
                aria-controls="campaign-detail-actions-menu"
                onClick={() => setMenuAbierto((abierto) => !abierto)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
                </svg>
              </button>
              {menuAbierto && (
                <div id="campaign-detail-actions-menu" className="report-card-menu-dropdown campaign-detail-actions-menu" role="menu">
                  <button type="button" className="report-card-menu-item neutral" role="menuitem" onClick={abrirEdicion}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                    Editar campaña
                  </button>
                  <button type="button" className="report-card-menu-item" role="menuitem" onClick={() => void eliminarCampana()} disabled={eliminando}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/></svg>
                    {eliminando ? "Eliminando…" : "Eliminar campaña"}
                  </button>
                </div>
              )}
            </div>
          ) : <div style={{ width: 34 }} />}
        </div>

        {/* Nombre / estado / fechas — arriba, ancho completo */}
        <div className="campaign-detail-summary">
          <div className="campaign-detail-title-row">
            <div className="campaign-detail-panel-name">
              {tituloCampana}
            </div>
            <Badge estado={estado} />
          </div>
          <div className="campaign-detail-meta campaign-detail-meta-first">
            <HeaderIcon type="calendar" />
            <span>{fechaCorta(contrato.inicio)} – {fechaCorta(contrato.fin)}</span>
          </div>
          {panel && (
            <div className="campaign-detail-meta">
              <HeaderIcon type="pin" />
              <span>
                {panelesContrato.length > 1
                  ? panelesContrato.map((p) => p.nombre).join(", ")
                  : [panel.direccion, panel.ciudad].filter(Boolean).join(" · ") || panel.nombre}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="detalle-campana-line" style={{ height: 3, flexShrink: 0 }} />

      {/* Tabs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", background: "#fff", borderBottom: "1px solid #E5E7EB", flexShrink: 0 }}>
        {TABS.map((t) => (
          <div key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "16px 0 14px", fontSize: 14, fontWeight: tab === t.id ? 800 : 500,
            color: tab === t.id ? "#0877FF" : "#64748B",
            borderBottom: tab === t.id ? "3px solid #0877FF" : "3px solid transparent",
            cursor: "pointer", textAlign: "center",
          }}>
            {t.label}
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>

        {/* ── TAB RESUMEN ── */}
        {tab === "resumen" && (
          <>
            {/* Estado general */}
            <div style={{ background: "#fff", borderRadius: 16, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1220", marginBottom: 10 }}>Estado general</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                  background: estado === "Activa" ? "#22C55E" : estado === "Programada" ? "#0877FF" : "#64748B",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0B1220" }}>
                    {estado === "Activa" ? "Todo funcionando" : estado === "Programada" ? "Por iniciar" : "Campaña finalizada"}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748B" }}>Sin incidencias reportadas</div>
                </div>
              </div>
            </div>

            {/* Info del panel -- un mapa por cada panel de la campaña
                (antes solo mostraba el primero, aunque hubiera 2+),
                cada uno con su nombre arriba para saber cual es cual. */}
            {panelesContrato.length > 0 && (
              <div style={{ background: "#fff", borderRadius: 16, padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1220", marginBottom: 10 }}>
                  {panelesContrato.length > 1 ? "Ubicación de las pantallas" : "Ubicación de pantalla"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {panelesContrato.map((p) => (
                    <div key={p.id}>
                      {panelesContrato.length > 1 && (
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#0B1220", marginBottom: 6 }}>{p.nombre}</div>
                      )}
                      {p.lat && p.lng ? (
                        <CampaignLocationMap panel={p} />
                      ) : (
                        <div style={{ fontSize: 13, color: "#64748B" }}>{p.direccion ?? "Sin coordenadas registradas"}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="campaign-expiry-card">
              <div className="campaign-expiry-main">
                <span className="campaign-expiry-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="4.5" width="18" height="17" rx="2" />
                    <path d="M8 2.5v4M16 2.5v4M3 9.5h18" />
                    <path d="m9.2 15 1.8 1.8 4-4" />
                  </svg>
                </span>
                <div className="campaign-expiry-copy">
                  <span>Vencimiento de la campaña</span>
                  <strong>{fechaLarga(contrato.fin)}</strong>
                </div>
                <span className={`campaign-expiry-status${estado === "Finalizada" ? " is-finished" : ""}`}>
                  {etiquetaVencimiento}
                </span>
              </div>

              <div className="campaign-period-rail" aria-label={`Periodo: ${fechaCorta(contrato.inicio)} a ${fechaCorta(contrato.fin)}`}>
                <div><span>Inicio</span><strong>{fechaCorta(contrato.inicio)}</strong></div>
                <i aria-hidden="true"><b className={`is-${estado.toLowerCase()}`} /></i>
                <div><span>Fin</span><strong>{fechaCorta(contrato.fin)}</strong></div>
              </div>

              {estado !== "Finalizada" && (
                <button
                  type="button"
                  onClick={agregarRecordatorio}
                  className="campaign-expiry-calendar-btn"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4.5" width="18" height="17" rx="2" />
                    <path d="M8 2.5v4M16 2.5v4M3 9.5h18" />
                  </svg>
                  Agregar vencimiento al calendario
                </button>
              )}

              {puedeRenovar && (
                renovacion === "enviada" ? (
                  <div style={{
                    marginTop: 12, padding: "11px 12px", borderRadius: 10,
                    background: "rgba(34,197,94,0.09)", border: "1px solid rgba(34,197,94,0.25)",
                    color: "#15803D", fontSize: 12, fontWeight: 700,
                    display: "flex", alignItems: "center", gap: 7,
                  }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
                    Solicitud de renovación enviada
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={solicitarRenovacion}
                    disabled={renovacion === "enviando"}
                    style={{
                      marginTop: 12, width: "100%", padding: "12px", borderRadius: 10,
                      border: "none", background: "#0877FF", color: "#fff",
                      fontSize: 13, fontWeight: 800, cursor: renovacion === "enviando" ? "default" : "pointer",
                      opacity: renovacion === "enviando" ? 0.7 : 1,
                    }}
                  >
                    {renovacion === "enviando" ? "Enviando…" : "Solicitar renovación"}
                  </button>
                )
              )}
              {renovacion === "error" && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#DC2626" }}>{errorRenovacion}</div>
              )}
            </div>

          </>
        )}

        {/* ── TAB REPORTES ── */}
        {tab === "reportes" && (
          <div>
            {informesState.status === "loading" && (
              <div style={{ fontSize: 13, color: "#64748B", textAlign: "center", padding: "24px 0" }}>Cargando…</div>
            )}

            {informesState.status === "error" && (
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#DC2626", padding: "10px 12px", borderRadius: 12, fontSize: 12 }}>
                No se pudo cargar la lista de reportes: {informesState.message}
              </div>
            )}

            {informesState.status === "ready" && informes.length === 0 && (
              <div style={{ background: "#fff", borderRadius: 16, padding: 16, textAlign: "center" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                  <EmptyReportsIcon />
                </div>
                <div style={{ fontSize: 13, color: "#64748B" }}>Aún no hay un reporte PDF generado para esta campaña.</div>
              </div>
            )}

            {informesState.status === "ready" && informes.length > 0 && (
              <>
                {agruparPorMes(informes).map((grupo) => (
                  <div key={grupo.mes}>
                    <div className="reports-month-header">{etiquetaMes(grupo.mes)}</div>
                    <div className="reports-list">
                      {grupo.items.map((informe) => (
                        <ReportCard
                          key={informe.id}
                          informe={informe}
                          cliente={cliente}
                          clienteId={contrato.cliente_id}
                          isAdmin={isAdmin}
                          onEliminado={informesState.recargar}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {editando && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Editar campaña"
          className="campaign-edit-backdrop"
          onClick={() => !editando.guardando && setEditando(null)}
        >
          <div className="campaign-edit-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="campaign-edit-title">Editar campaña</div>
            <div className="campaign-edit-subtitle">Actualiza el nombre y la vigencia de la campaña.</div>

            <label htmlFor="detalle-editar-nombre-campana" className="campaign-edit-label">Nombre de la campaña</label>
            <input
              id="detalle-editar-nombre-campana"
              autoFocus
              className="campaign-edit-input"
              value={editando.nombre}
              onChange={(event) => setEditando({ ...editando, nombre: event.target.value, error: "" })}
              disabled={editando.guardando}
            />

            <div className="campaign-edit-dates">
              <label className="campaign-edit-label">
                Fecha de inicio
                <input
                  type="date"
                  className="campaign-edit-input"
                  value={editando.inicio}
                  onChange={(event) => setEditando({ ...editando, inicio: event.target.value, error: "" })}
                  disabled={editando.guardando}
                />
              </label>
              <label className="campaign-edit-label">
                Fecha de fin
                <input
                  type="date"
                  className="campaign-edit-input"
                  value={editando.fin}
                  onChange={(event) => setEditando({ ...editando, fin: event.target.value, error: "" })}
                  disabled={editando.guardando}
                />
              </label>
            </div>

            {editando.error && <div className="campaign-edit-error">{editando.error}</div>}

            <div className="campaign-edit-footer">
              <button type="button" className="campaign-edit-cancel" onClick={() => setEditando(null)} disabled={editando.guardando}>Cancelar</button>
              <button type="button" className="campaign-edit-save" onClick={() => void guardarEdicion()} disabled={editando.guardando}>
                {editando.guardando ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
