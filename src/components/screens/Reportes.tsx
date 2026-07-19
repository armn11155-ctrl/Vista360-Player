import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useInformes } from "../../hooks/useInformes";
import { cloudFunctions } from "../../config/firebase";
import type { Cliente, Contrato, Panel } from "../../types";
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
  const [fotosReporte, setFotosReporte] = useState<FotoReporte[]>([]);
  const [colaRecorte, setColaRecorte] = useState<File[] | null>(null);
  const [mensajeAdmin, setMensajeAdmin] = useState<string | null>(null);
  const [mensajeAdminTipo, setMensajeAdminTipo] = useState<"ok" | "error">("ok");
  const [panelId, setPanelId] = useState("");
  const [panelMenuAbierto, setPanelMenuAbierto] = useState(false);

  // Paneles unicos de este cliente (segun sus contratos) -- para poder
  // elegir de cual generar el reporte, en vez de siempre mezclar todos.
  const panelesCliente = Array.from(
    new Map(
      contratos
        .map((c) => paneles[c.panel_id])
        .filter((p): p is Panel => Boolean(p))
        .map((p) => [p.id, p])
    ).values()
  );
  const panelSeleccionado = panelId ? paneles[panelId] : undefined;
  const panelPrincipal = panelSeleccionado ?? (contratos[0]?.panel_id ? paneles[contratos[0].panel_id] : undefined);
  const ubicacionAuto = [panelPrincipal?.nombre, panelPrincipal?.direccion, panelPrincipal?.ciudad]
    .filter(Boolean)
    .join(" - ") || cliente?.ciudad || "Ubicación del cliente";

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

  function agregarFotos(files: FileList | null) {
    if (!files?.length) return;
    const imagenes = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, Math.max(0, 12 - fotosReporte.length));
    if (imagenes.length === 0) {
      setMensajeAdminTipo("error");
      setMensajeAdmin("Selecciona archivos de imagen.");
      return;
    }
    setMensajeAdmin(null);
    setColaRecorte(imagenes);
  }

  function alTerminarRecorte(resultados: { dataUrl: string; nombre: string }[]) {
    const nuevas: FotoReporte[] = resultados.map((r) => ({
      id: `${r.nombre}-${Date.now()}-${crypto.randomUUID()}`,
      nombre: r.nombre,
      dataUrl: r.dataUrl,
    }));
    setFotosReporte((actuales) => [...actuales, ...nuevas].slice(0, 12));
    setColaRecorte(null);
  }

  function quitarFoto(id: string) {
    setFotosReporte((actuales) => actuales.filter((foto) => foto.id !== id));
  }

  async function generarReporte() {
    if (!cloudFunctions || generando) return;
    setGenerando(true);
    setMensajeAdmin(null);
    try {
      const generarReporteCliente = httpsCallable<{ clienteId: string; mes: string; dia: string; panelId?: string; fotos?: { url: string; fecha: string }[] }, GenerarReporteResponse>(
        cloudFunctions,
        "generarReporteCliente"
      );
      await generarReporteCliente({
        clienteId,
        mes,
        dia,
        panelId: panelId || undefined,
        fotos: fotosReporte.map((foto) => ({
          url: foto.dataUrl,
          fecha: new Date().toISOString().slice(0, 10),
        })),
      });
      setMensajeAdminTipo("ok");
      setMensajeAdmin("Reporte generado. Ya puedes verlo y enviarlo desde la lista.");
      setFotosReporte([]);
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
        {isAdmin && panelesCliente.length > 0 && (
          <div className="reports-panel-filter-wrap">
            <button
              type="button"
              className="reports-panel-filter"
              onClick={() => setPanelMenuAbierto((v) => !v)}
              aria-label="Filtrar por panel"
            >
              <span>{panelSeleccionado ? panelSeleccionado.nombre : "Todos los paneles"}</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {panelMenuAbierto && (
              <div className="reports-panel-dropdown">
                <button
                  type="button"
                  className={`reports-panel-dropdown-item${!panelId ? " active" : ""}`}
                  onClick={() => {
                    setPanelId("");
                    setPanelMenuAbierto(false);
                  }}
                >
                  <div className="reports-panel-dropdown-item-name">Todos los paneles</div>
                </button>
                {panelesCliente.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className={`reports-panel-dropdown-item${panelId === p.id ? " active" : ""}`}
                    onClick={() => {
                      setPanelId(p.id);
                      setPanelMenuAbierto(false);
                    }}
                  >
                    <div className="reports-panel-dropdown-item-name">{p.nombre}</div>
                    <div className="reports-panel-dropdown-item-sub">
                      {[p.direccion, p.ciudad].filter(Boolean).join(" · ") || "Sin dirección"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

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
              <label className="report-photo-picker">
                <span>Fotos del reporte</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    agregarFotos(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
                <div className="report-photo-picker-btn">Agregar fotos</div>
              </label>
              <button
                className="report-generate-btn"
                type="button"
                onClick={generarReporte}
                disabled={!hayContratos || !mes || generando}
              >
                {generando ? "Generando..." : "Generar PDF"}
              </button>
            </div>
            <div className="report-auto-data">
              <span>Cliente: {nombreCliente(cliente)}</span>
              <span>Ubicación: {ubicacionAuto}</span>
            </div>
            {fotosReporte.length > 0 && (
              <div className="report-photo-grid">
                {fotosReporte.map((foto, index) => (
                  <div className="report-photo-thumb" key={foto.id}>
                    <img src={foto.dataUrl} alt={`Foto ${index + 1}`} />
                    <button type="button" onClick={() => quitarFoto(foto.id)} aria-label="Quitar foto">
                      ×
                    </button>
                  </div>
                ))}
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
          <div className="reports-list">
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
