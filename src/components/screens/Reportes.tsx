import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useInformes } from "../../hooks/useInformes";
import { cloudFunctions } from "../../config/firebase";
import { useSignedUrls } from "../../hooks/useSignedUrls";
import type { Cliente, Contrato, Panel } from "../../types";

interface Props {
  cliente: Cliente | null;
  clienteId: string;
  hayContratos: boolean;
  contratos?: Contrato[];
  paneles?: Record<string, Panel>;
  isAdmin?: boolean;
}

type FotoReporte = {
  id: string;
  nombre: string;
  dataUrl: string;
};

type GenerarReporteResponse = {
  ok: boolean;
  urlDigital: string;
  urlHd: string;
  digitalBytes: number;
  hdBytes: number;
};

function mesActual() {
  return new Date().toISOString().slice(0, 7);
}

function nombreCliente(cliente: Cliente | null) {
  return cliente?.empresa || cliente?.contacto || "cliente";
}

function fechaCorta(date: Date) {
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${String(date.getDate()).padStart(2, "0")} ${meses[date.getMonth()]} ${date.getFullYear()}`;
}

function fechaGenerada(createdAt: unknown, mes: string) {
  if (createdAt && typeof createdAt === "object" && "toDate" in createdAt) {
    const toDate = (createdAt as { toDate?: () => Date }).toDate;
    if (typeof toDate === "function") return fechaCorta(toDate());
  }
  const fallback = new Date(`${mes || mesActual()}-01T12:00:00`);
  return fechaCorta(Number.isNaN(fallback.getTime()) ? new Date() : fallback);
}

function formatoBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fotoADataUrl(file: File): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("No se pudo procesar la imagen."));
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });

  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar la imagen.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function mensajeReporte(mesLabel: string, cliente: Cliente | null, urlDigital: string, urlHd: string) {
  const nombre = nombreCliente(cliente);
  return [
    `Hola ${nombre}, te comparto tu reporte de ${mesLabel} de Vista360.`,
    "",
    "Lo preparamos en formato digital para que puedas revisarlo de forma rápida, segura y con una presentación premium.",
    "",
    `Puedes verlo aquí: ${urlDigital}`,
    `Descarga en máxima calidad: ${urlHd}`,
    "",
    "También queda disponible en tu portal Vista360 para consultarlo cuando lo necesites.",
  ].join("\n");
}

export default function Reportes({ cliente, clienteId, hayContratos, contratos = [], paneles = {}, isAdmin }: Props) {
  const informesState = useInformes(clienteId);
  const informes = informesState.status === "ready" ? informesState.informes : [];
  // Las URLs guardadas expiran a las 6h (bucket privado) — re-firmamos
  // con las r2Keys reales cada vez que se abre la pantalla.
  const keysReportes = informes.flatMap((i) => (i.r2Keys ? [i.r2Keys.digital, i.r2Keys.hd] : []));
  const urlsFirmadas = useSignedUrls(keysReportes);
  const [mes, setMes] = useState(mesActual());
  const [generando, setGenerando] = useState(false);
  const [procesandoFotos, setProcesandoFotos] = useState(false);
  const [fotosReporte, setFotosReporte] = useState<FotoReporte[]>([]);
  const [mensajeAdmin, setMensajeAdmin] = useState<string | null>(null);
  const [mensajeAdminTipo, setMensajeAdminTipo] = useState<"ok" | "error">("ok");
  const panelPrincipal = contratos[0]?.panel_id ? paneles[contratos[0].panel_id] : undefined;
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

  async function agregarFotos(files: FileList | null) {
    if (!files?.length) return;
    setProcesandoFotos(true);
    setMensajeAdmin(null);
    try {
      const nuevas = await Promise.all(
        Array.from(files)
          .filter((file) => file.type.startsWith("image/"))
          .map(async (file) => ({
            id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
            nombre: file.name,
            dataUrl: await fotoADataUrl(file),
          }))
      );
      setFotosReporte((actuales) => [...actuales, ...nuevas].slice(0, 12));
    } catch (error) {
      setMensajeAdminTipo("error");
      setMensajeAdmin(error instanceof Error ? error.message : "No se pudieron cargar las fotos.");
    } finally {
      setProcesandoFotos(false);
    }
  }

  function quitarFoto(id: string) {
    setFotosReporte((actuales) => actuales.filter((foto) => foto.id !== id));
  }

  async function generarReporte() {
    if (!cloudFunctions || generando || procesandoFotos) return;
    setGenerando(true);
    setMensajeAdmin(null);
    try {
      const generarReporteCliente = httpsCallable<{ clienteId: string; mes: string; fotos?: { url: string; fecha: string }[] }, GenerarReporteResponse>(
        cloudFunctions,
        "generarReporteCliente"
      );
      await generarReporteCliente({
        clienteId,
        mes,
        fotos: fotosReporte.map((foto) => ({
          url: foto.dataUrl,
          fecha: new Date().toISOString().slice(0, 10),
        })),
      });
      setMensajeAdminTipo("ok");
      setMensajeAdmin("Reporte generado. Ya puedes verlo y enviarlo desde la lista.");
      setFotosReporte([]);
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
          <div className="reports-header-title">Reportes</div>
        </div>
      </div>

      <div className="reports-screen-body">
        <div className="reports-panel-filter" aria-label="Filtrar paneles">
          <span>Todos los paneles</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>

        {isAdmin && (
          <div className="report-admin-panel">
            <div className="report-admin-copy">
              <div className="report-admin-title">Generar reporte del cliente</div>
              <div className="report-admin-sub">
                Solo tu cuenta admin puede crear PDFs y publicarlos en el portal del cliente.
              </div>
            </div>
            <div className="report-admin-controls">
              <label className="report-month-field">
                <span>Mes del reporte</span>
                <input
                  className="report-month-input"
                  type="month"
                  value={mes}
                  onChange={(e) => setMes(e.target.value)}
                  aria-label="Mes del reporte"
                />
              </label>
              <label className="report-photo-picker">
                <span>Fotos del reporte</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    void agregarFotos(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
                <div className="report-photo-picker-btn">
                  {procesandoFotos ? "Preparando fotos..." : "Agregar fotos"}
                </div>
              </label>
              <button
                className="report-generate-btn"
                type="button"
                onClick={generarReporte}
                disabled={!hayContratos || !mes || generando || procesandoFotos}
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
            <div className="report-admin-hint">
              Sube las fotos del reporte; cliente, período y ubicación se completan automáticamente. Si no subes fotos, se usarán las fotos guardadas del mes.
            </div>
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
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" strokeWidth="2">
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
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" strokeWidth="2">
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
            {informes.map((informe) => {
              const urlDigital = (informe.r2Keys && urlsFirmadas[informe.r2Keys.digital]) || informe.urlDigital || informe.url;
              const urlHd = (informe.r2Keys && urlsFirmadas[informe.r2Keys.hd]) || informe.urlHd || informe.urlDigital || informe.url;
              const mensaje = mensajeReporte(informe.mesLabel, cliente, urlDigital, urlHd);
              const emailSubject = `Reporte ${informe.mesLabel} - Vista360`;
              const emailTo = cliente?.email ?? "";
              const hdSize = formatoBytes(informe.hdBytes);

              return (
                <div className="report-card" key={informe.id}>
                  <div className="report-card-main">
                    <div className="report-pdf-icon" aria-hidden="true">
                      <svg width="46" height="58" viewBox="0 0 46 58" fill="none">
                        <path d="M7 1.5h22.5L44.5 16v35A5.5 5.5 0 0 1 39 56.5H7A5.5 5.5 0 0 1 1.5 51V7A5.5 5.5 0 0 1 7 1.5Z" fill="#123778" stroke="#4B7FE7" />
                        <path d="M29.5 1.5V12A4.5 4.5 0 0 0 34 16.5h10.5" fill="#6FA2FF" fillOpacity=".35" />
                        <rect x="12.5" y="22.5" width="21" height="19" rx="1.5" stroke="#BFD5FF" strokeWidth="1.6" />
                        <path d="M17 28h8M17 32h12M17 36h15" stroke="#BFD5FF" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                      <span>PDF</span>
                    </div>
                    <div className="report-card-copy">
                      <div className="report-kicker">Reporte mensual</div>
                      <div className="report-title">{informe.mesLabel}</div>
                      <div className="report-meta">Generado el {fechaGenerada(informe.createdAt, informe.mes)}</div>
                      {hdSize && <div className="report-meta">Tamaño HD: {hdSize}</div>}
                    </div>
                    <div className="report-ready-badge">Listo</div>
                  </div>
                  <div className="report-actions">
                    <a className="report-action report-action-outline" href={urlDigital} target="_blank" rel="noreferrer">
                      Ver digital
                    </a>
                    <a className="report-action report-action-primary" href={urlHd} target="_blank" rel="noreferrer">
                      Descargar HD
                    </a>
                    {isAdmin && (
                      <>
                        <a
                          className="report-action report-action-muted report-action-whatsapp"
                          href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M20.5 11.7a8.4 8.4 0 0 1-12.4 7.4L4 20l.9-4a8.4 8.4 0 1 1 15.6-4.3Z" />
                            <path d="M9.2 8.7c.2-.5.4-.5.7-.5h.6c.2 0 .5.1.6.4.2.5.7 1.7.8 1.8.1.2.1.4 0 .6l-.4.5c-.1.2-.3.3-.1.6.2.3.8 1.3 1.8 2 .9.7 1.7.9 2 .9.2.1.4 0 .6-.2l.7-.9c.2-.2.4-.2.6-.1l1.8.9c.3.1.4.3.4.4 0 .5-.3 1.4-.8 1.7-.4.3-1.2.5-2.1.2-1-.3-2.2-.8-3.6-2-1.6-1.4-2.6-3-3-4-.4-1-.4-1.8-.1-2.4Z" />
                          </svg>
                          WhatsApp
                        </a>
                        <a
                          className="report-action report-action-muted"
                          href={`mailto:${emailTo}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(mensaje)}`}
                        >
                          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <rect x="3" y="5" width="18" height="14" rx="2" />
                            <path d="m4 7 8 6 8-6" />
                          </svg>
                          Correo
                        </a>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
