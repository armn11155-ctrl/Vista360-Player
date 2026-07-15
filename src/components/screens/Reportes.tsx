import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useInformes } from "../../hooks/useInformes";
import { cloudFunctions } from "../../config/firebase";
import type { Cliente } from "../../types";

interface Props {
  cliente: Cliente | null;
  clienteId: string;
  hayContratos: boolean;
  isAdmin?: boolean;
}

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

export default function Reportes({ cliente, clienteId, hayContratos, isAdmin }: Props) {
  const informesState = useInformes(clienteId);
  const informes = informesState.status === "ready" ? informesState.informes : [];
  const [mes, setMes] = useState(mesActual());
  const [generando, setGenerando] = useState(false);
  const [mensajeAdmin, setMensajeAdmin] = useState<string | null>(null);
  const [mensajeAdminTipo, setMensajeAdminTipo] = useState<"ok" | "error">("ok");

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

  async function generarReporte() {
    if (!cloudFunctions || generando) return;
    setGenerando(true);
    setMensajeAdmin(null);
    try {
      const generarReporteCliente = httpsCallable<{ clienteId: string; mes: string }, GenerarReporteResponse>(
        cloudFunctions,
        "generarReporteCliente"
      );
      await generarReporteCliente({ clienteId, mes });
      setMensajeAdminTipo("ok");
      setMensajeAdmin("Reporte generado. Ya puedes verlo y enviarlo desde la lista.");
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
              <button
                className="report-generate-btn"
                type="button"
                onClick={generarReporte}
                disabled={!hayContratos || !mes || generando}
              >
                {generando ? "Generando..." : "Generar PDF"}
              </button>
            </div>
            <div className="report-admin-hint">
              El PDF se creará con el diseño horizontal premium y aparecerá abajo cuando termine.
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
