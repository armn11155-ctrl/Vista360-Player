import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useInformes } from "../../hooks/useInformes";
import { cloudFunctions } from "../../config/firebase";
import type { Cliente, Contrato, Panel } from "../../types";
import { panelesDeContrato } from "../../types";
import MobileSidebarButton from "../MobileSidebarButton";
import { PhotoCropQueueModal } from "../PhotoCropQueueModal";
import { ReportCard } from "../ReportCard";

interface Props {
  cliente: Cliente | null;
  clienteId: string;
  hayContratos: boolean;
  contratos?: Contrato[];
  paneles?: Record<string, Panel>;
  isAdmin?: boolean;
  onMenuClick?: () => void;
}

type FotoReporte = {
  id: string;
  nombre: string;
  dataUrl: string;
};

type GenerarReporteResponse = {
  ok: boolean;
  url: string;
  bytes: number;
};

type PanelFotosPayload = {
  panelId: string;
  panelNombre?: string;
  fotos: { url: string; fecha: string }[];
};

function mesActual() {
  return new Date().toISOString().slice(0, 7);
}

const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function aniosDisponibles() {
  const actual = new Date().getFullYear();
  const anios: number[] = [];
  for (let a = actual - 3; a <= 2080; a++) anios.push(a);
  return anios;
}

/** Solo para el selector de dia (referencia visual) -- el reporte
 *  generado sigue siendo del mes completo, el dia no cambia que fotos
 *  entran. */
function diasDelMes(mes: string) {
  const [year, month] = mes.split("-").map(Number);
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

function nombreCliente(cliente: Cliente | null) {
  return cliente?.empresa || cliente?.contacto || "cliente";
}

export default function Reportes({ cliente, clienteId, hayContratos, contratos = [], paneles = {}, isAdmin, onMenuClick }: Props) {
  const informesState = useInformes(clienteId);
  const informes = informesState.status === "ready" ? informesState.informes : [];
  const [mes, setMes] = useState(mesActual());
  // Solo de referencia visual (no se envia al generar el reporte, que
  // sigue siendo por mes completo) -- el admin pidio poder ver/elegir
  // un dia junto al mes y año.
  const [dia, setDia] = useState(() => String(new Date().getDate()).padStart(2, "0"));
  const [generando, setGenerando] = useState(false);
  const [colaRecorte, setColaRecorte] = useState<File[] | null>(null);
  // A cual panel pertenece la cola de recorte actual -- el reporte
  // siempre se genera por campaña, así que siempre hay un panel de
  // destino (uno o varios, según cuantos paneles tenga la campaña).
  const [colaRecortePanelId, setColaRecortePanelId] = useState<string | null>(null);
  const [mensajeAdmin, setMensajeAdmin] = useState<string | null>(null);
  const [mensajeAdminTipo, setMensajeAdminTipo] = useState<"ok" | "error">("ok");

  // El reporte se genera SIEMPRE por campaña (ya no por panel suelto)
  // -- se elige la campaña de este cliente y, si tiene 2+ paneles, se
  // pide una foto por cada uno (en vez de una sola bandeja de fotos
  // sin distinguir de que panel es cada una). Por defecto se deja
  // elegida la primera campaña de la lista.
  const [contratoId, setContratoId] = useState(() => contratos[0]?.id ?? "");
  const contratoSeleccionado = contratos.find((c) => c.id === contratoId) ?? contratos[0];
  const panelIdsCampana = contratoSeleccionado ? panelesDeContrato(contratoSeleccionado) : [];
  const [fotosPorPanel, setFotosPorPanel] = useState<Record<string, FotoReporte[]>>({});

  const ubicacionAuto = panelIdsCampana.map((id) => paneles[id]?.nombre).filter(Boolean).join(" + ")
    || cliente?.ciudad || "Ubicación del cliente";

  function labelCampana(c: Contrato) {
    const ids = panelesDeContrato(c);
    const nombres = ids.map((id) => paneles[id]?.nombre ?? id).join(" + ");
    return `${c.nombre || nombres || "Campaña"} (${c.inicio} – ${c.fin})`;
  }

  function mensajeErrorReporte(error: unknown) {
    const raw = error instanceof Error ? error.message : String(error || "");
    if (raw.toLowerCase().includes("internal")) {
      return raw.replace("FirebaseError: ", "").replace(/^functions\/internal:\s*/i, "")
        || "No se pudo generar el PDF. Revisa la configuración de almacenamiento.";
    }
    if (raw.toLowerCase().includes("not-found")) {
      return "No encuentro la función para generar PDFs. Falta desplegar las Functions.";
    }
    if (raw.toLowerCase().includes("failed-precondition")) {
      return raw.replace("FirebaseError: ", "");
    }
    return raw.replace("FirebaseError: ", "") || "No se pudo generar el reporte.";
  }

  function agregarFotos(files: FileList | null, panelId: string) {
    if (!files?.length) return;
    const actuales = fotosPorPanel[panelId]?.length ?? 0;
    const imagenes = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, Math.max(0, 12 - actuales));
    if (imagenes.length === 0) {
      setMensajeAdminTipo("error");
      setMensajeAdmin("Selecciona archivos de imagen.");
      return;
    }
    setMensajeAdmin(null);
    setColaRecortePanelId(panelId);
    setColaRecorte(imagenes);
  }

  function alTerminarRecorte(resultados: { dataUrl: string; nombre: string }[]) {
    const nuevas: FotoReporte[] = resultados.map((r) => ({
      id: `${r.nombre}-${Date.now()}-${crypto.randomUUID()}`,
      nombre: r.nombre,
      dataUrl: r.dataUrl,
    }));
    const panelId = colaRecortePanelId;
    if (panelId) {
      setFotosPorPanel((actuales) => ({
        ...actuales,
        [panelId]: [...(actuales[panelId] ?? []), ...nuevas].slice(0, 12),
      }));
    }
    setColaRecorte(null);
    setColaRecortePanelId(null);
  }

  function quitarFoto(id: string, panelId: string) {
    setFotosPorPanel((actuales) => ({
      ...actuales,
      [panelId]: (actuales[panelId] ?? []).filter((foto) => foto.id !== id),
    }));
  }

  async function generarReporte() {
    if (!cloudFunctions || generando || !contratoSeleccionado) return;
    setGenerando(true);
    setMensajeAdmin(null);
    try {
      const generarReporteCliente = httpsCallable<
        {
          clienteId: string;
          mes: string;
          dia: string;
          panelId?: string;
          contratoId?: string;
          panelesFotos?: PanelFotosPayload[];
        },
        GenerarReporteResponse
      >(cloudFunctions, "generarReporteCliente");

      // Antes se mandaba la fecha real de HOY para cada foto, sin
      // importar que dia/mes eligio el admin arriba -- por eso las
      // paginas de evidencia mostraban la fecha de hoy en vez de la
      // fecha del reporte. Ahora usan la misma fecha seleccionada.
      const fecha = `${mes}-${dia}`;

      await generarReporteCliente({
        clienteId,
        mes,
        dia,
        contratoId: contratoSeleccionado.id,
        panelId: panelIdsCampana[0] || undefined,
        panelesFotos: panelIdsCampana.map((id) => ({
          panelId: id,
          panelNombre: paneles[id]?.nombre,
          fotos: (fotosPorPanel[id] ?? []).map((foto) => ({ url: foto.dataUrl, fecha })),
        })),
      });
      setMensajeAdminTipo("ok");
      setMensajeAdmin("Reporte generado. Ya puedes verlo y enviarlo desde la lista.");
      setFotosPorPanel({});
      informesState.recargar();
    } catch (error) {
      setMensajeAdminTipo("error");
      setMensajeAdmin(mensajeErrorReporte(error));
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div>
      <div className="evidencias-header reports-header">
        <div className="ev-logo-row">
          <div className="mobile-header-title-group">
            <MobileSidebarButton onClick={onMenuClick} />
            <div className="reports-header-title">Reportes</div>
          </div>
        </div>
      </div>

      <div className="reports-screen-body">
        {isAdmin && (
          <div className="report-admin-panel">
            <div className="report-admin-header">
              <div className="report-admin-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="17" rx="3" />
                  <path d="M3 9h18" />
                  <path d="M8 2.5v3M16 2.5v3" />
                  <path d="M12 13v5M9.5 15.5h5" />
                </svg>
              </div>
              <div className="report-admin-copy">
                <div className="report-admin-title">Generar reporte del cliente</div>
                <div className="report-admin-sub">
                  Solo tu cuenta admin puede crear PDFs y publicarlos en el portal del cliente.
                </div>
              </div>
            </div>
            <div className="report-admin-controls">
              <div className="report-campaign-field">
                <span>Campaña — el reporte se organiza por campaña</span>
                {contratos.length > 0 ? (
                  <select
                    className="reports-panel-select"
                    value={contratoSeleccionado?.id ?? ""}
                    onChange={(e) => { setContratoId(e.target.value); setFotosPorPanel({}); }}
                    aria-label="Elegir campaña para el reporte"
                  >
                    {contratos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {labelCampana(c)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="report-campaign-panels-hint">
                    Este cliente todavía no tiene ninguna campaña creada -- crea una primero desde
                    "Nueva campaña" para poder generar su reporte.
                  </div>
                )}
              </div>
              <div className="report-month-field">
                <span>Fecha del reporte — toca para cambiar día, mes o año</span>
                <div className="report-month-selects">
                  <select
                    className="report-month-select report-month-select-dia"
                    value={dia}
                    onChange={(e) => setDia(e.target.value)}
                    aria-label="Día"
                  >
                    {Array.from({ length: diasDelMes(mes) }, (_, i) => String(i + 1).padStart(2, "0")).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <select
                    className="report-month-select"
                    value={mes.slice(5, 7)}
                    onChange={(e) => setMes(`${mes.slice(0, 4)}-${e.target.value}`)}
                    aria-label="Mes"
                  >
                    {NOMBRES_MES.map((nombre, i) => (
                      <option key={nombre} value={String(i + 1).padStart(2, "0")}>
                        {nombre}
                      </option>
                    ))}
                  </select>
                  <select
                    className="report-month-select report-month-select-anio"
                    value={mes.slice(0, 4)}
                    onChange={(e) => setMes(`${e.target.value}-${mes.slice(5, 7)}`)}
                    aria-label="Año"
                  >
                    {aniosDisponibles().map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                className="report-generate-btn"
                type="button"
                onClick={generarReporte}
                disabled={!contratoSeleccionado || !mes || generando}
              >
                {generando ? "Generando..." : "Generar PDF"}
              </button>
            </div>
            <div className="report-auto-data">
              <span>Cliente: {nombreCliente(cliente)}</span>
              <span>Ubicación: {ubicacionAuto}</span>
            </div>
            {panelIdsCampana.length > 0 && (
              <div className="report-campaign-panels">
                {panelIdsCampana.length > 1 && (
                  <div className="report-campaign-panels-hint">
                    Esta campaña tiene {panelIdsCampana.length} paneles — sube las fotos de evidencia de cada uno
                    por separado, así el PDF sale organizado por panel.
                  </div>
                )}
                {panelIdsCampana.map((id) => {
                  const p = paneles[id];
                  const direccion = p ? [p.direccion, p.ciudad].filter(Boolean).join(", ") : "";
                  const fotosPanel = fotosPorPanel[id] ?? [];
                  return (
                    <div className="report-campaign-panel-box" key={id}>
                      <div className="report-campaign-panel-header">
                        <div>
                          <div className="report-campaign-panel-name">{p?.nombre ?? id}</div>
                          {direccion && <div className="report-campaign-panel-sub">{direccion}</div>}
                        </div>
                        <label className="report-campaign-panel-add">
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => {
                              agregarFotos(e.target.files, id);
                              e.currentTarget.value = "";
                            }}
                          />
                          <span>Agregar fotos</span>
                        </label>
                      </div>
                      {fotosPanel.length > 0 && (
                        <div className="report-photo-grid">
                          {fotosPanel.map((foto, index) => (
                            <div className="report-photo-thumb" key={foto.id}>
                              <img src={foto.dataUrl} alt={`Foto ${index + 1}`} />
                              <button type="button" onClick={() => quitarFoto(foto.id, id)} aria-label="Quitar foto">
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {mensajeAdmin && (
              <div className={`report-admin-status ${mensajeAdminTipo === "error" ? "error" : "ok"}`}>
                {mensajeAdmin}
              </div>
            )}
          </div>
        )}

        {!hayContratos && (
          <div className="report-empty-state">
            <div className="report-empty-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0877FF" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <div className="report-empty-title">Sin campañas para reportar</div>
            <div className="report-empty-sub">Cuando este cliente tenga una campaña activa, podrás generar su reporte mensual.</div>
          </div>
        )}

        {hayContratos && informesState.status === "loading" && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center" }}>Cargando…</div>
        )}

        {hayContratos && informesState.status === "error" && (
          <div className="report-admin-status error" style={{ marginTop: 24 }}>
            No se pudo cargar la lista de reportes: {informesState.message}
          </div>
        )}

        {hayContratos && informesState.status === "ready" && informes.length === 0 && (
          <div className="report-empty-state">
            <div className="report-empty-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0877FF" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <div className="report-empty-title">Aún no hay reportes generados</div>
            <div className="report-empty-sub">El primer PDF aparecerá aquí después de generarlo desde tu cuenta admin.</div>
          </div>
        )}

        {informes.length > 0 && (
          <div className={`reports-list${isAdmin ? "" : " reports-list-client"}`}>
            {informes.map((informe) => (
              <ReportCard
                key={informe.id}
                informe={informe}
                cliente={cliente}
                clienteId={clienteId}
                isAdmin={isAdmin}
                onEliminado={informesState.recargar}
              />
            ))}
          </div>
        )}
      </div>

      {colaRecorte && colaRecorte.length > 0 && (
        <PhotoCropQueueModal
          fotos={colaRecorte}
          onCompletar={alTerminarRecorte}
          onCancelar={() => setColaRecorte(null)}
        />
      )}
    </div>
  );
}
