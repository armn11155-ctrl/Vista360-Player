import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useInformes } from "../../hooks/useInformes";
import { cloudFunctions } from "../../config/firebase";
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
      return "No se pudo generar todavía. La función del PDF necesita estar desplegada y configurada con R2 y Ghostscript.";
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
      <div className="evidencias-header">
        <div className="ev-logo-row">
          <div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>Reportes</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", background: "#0A1220", padding: 14 }}>
        <div className="report-header-blue">
          <div>
            <div className="text-blue">Reportes digitales</div>
            <div className="text-sub">
              Consulta la versión liviana en el portal o descarga el archivo en máxima calidad.
            </div>
          </div>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="1.5">
            <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
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
          <div className="card">
            {informes.map((informe) => {
              const urlDigital = informe.urlDigital || informe.url;
              const urlHd = informe.urlHd || informe.urlDigital || informe.url;
              const mensaje = mensajeReporte(informe.mesLabel, cliente, urlDigital, urlHd);
              const emailSubject = `Reporte ${informe.mesLabel} - Vista360`;
              const emailTo = cliente?.email ?? "";

              return (
                <div className="report-item" key={informe.id}>
                  <div className="report-icon blue">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <div className="report-info">
                    <div className="report-name">{informe.mesLabel}</div>
                    <div className="report-desc">{informe.numEvidencias} evidencia(s)</div>
                  </div>
                  <div className="report-actions">
                    {isAdmin && (
                      <>
                        <a
                          className="report-download report-send-whatsapp"
                          href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Enviar WhatsApp
                        </a>
                        <a
                          className="report-download report-send-email"
                          href={`mailto:${emailTo}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(mensaje)}`}
                        >
                          Enviar correo
                        </a>
                      </>
                    )}
                    <a className="report-download" href={urlDigital} target="_blank" rel="noreferrer">
                      Ver
                    </a>
                    <a className="report-download report-download-hd" href={urlHd} target="_blank" rel="noreferrer">
                      Máxima calidad
                    </a>
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
