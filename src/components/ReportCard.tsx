import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { cloudFunctions } from "../config/firebase";
import { useSignedUrls } from "../hooks/useSignedUrls";
import type { Cliente, InformeCliente } from "../types";

interface Props {
  informe: InformeCliente;
  cliente: Cliente | null;
  clienteId: string;
  isAdmin?: boolean;
  /** Se llama despues de eliminar el reporte con exito, para que el
   *  que lo use (Reportes.tsx, DetalleCampana.tsx) refresque su lista. */
  onEliminado?: () => void;
}

function nombreCliente(cliente: Cliente | null) {
  return cliente?.empresa || cliente?.contacto || "cliente";
}

function fechaCorta(date: Date) {
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${String(date.getDate()).padStart(2, "0")} ${meses[date.getMonth()]} ${date.getFullYear()}`;
}

function fechaGenerada(mes: string, dia?: string) {
  const diaValido = /^\d{1,2}$/.test(dia ?? "") ? String(dia).padStart(2, "0") : "01";
  const base = mes || new Date().toISOString().slice(0, 7);
  const fecha = new Date(`${base}-${diaValido}T12:00:00`);
  return fechaCorta(Number.isNaN(fecha.getTime()) ? new Date() : fecha);
}

function formatoBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mensajeReporte(mesLabel: string, cliente: Cliente | null, url: string) {
  const nombre = nombreCliente(cliente);
  return [
    `Hola ${nombre}, te comparto tu reporte de ${mesLabel} de Vista360.`,
    "",
    "Lo preparamos con una presentación premium, listo para ver o descargar.",
    "",
    `Puedes verlo aquí: ${url}`,
    "",
    "También queda disponible en tu portal Vista360 para consultarlo cuando lo necesites.",
  ].join("\n");
}

/**
 * Tarjeta de un reporte PDF generado — mismo diseño en la pantalla
 * principal de Reportes y dentro del detalle de cada campaña (pestaña
 * Reportes), para que se vea igual en los dos lados.
 */
export function ReportCard({ informe, cliente, clienteId, isAdmin, onEliminado }: Props) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState("");

  const keysAFirmar = informe.r2Keys ? [informe.r2Keys.digital] : [];
  const urlsFirmadas = useSignedUrls(keysAFirmar);
  const url = (informe.r2Keys && urlsFirmadas[informe.r2Keys.digital]) || informe.urlDigital || informe.url;

  const mensaje = mensajeReporte(informe.mesLabel, cliente, url);
  const emailSubject = `Reporte ${informe.mesLabel} - Vista360`;
  const emailTo = cliente?.email ?? "";
  const tamano = formatoBytes(informe.digitalBytes);

  /** El admin pidió que un solo botón haga las dos cosas: descargar el
   *  PDF Y también llevarlo a la página donde se ve en el navegador.
   *  Son dos URLs firmadas de la misma key -- una pensada para verse
   *  (url) y otra que fuerza la descarga con Content-Disposition:
   *  attachment (informe.urlDescarga, ver listarReportesCliente.ts). */
  function verYDescargar() {
    const enlaceDescarga = document.createElement("a");
    enlaceDescarga.href = informe.urlDescarga || url;
    enlaceDescarga.download = "";
    enlaceDescarga.rel = "noreferrer";
    document.body.appendChild(enlaceDescarga);
    enlaceDescarga.click();
    enlaceDescarga.remove();
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function eliminarReporte() {
    if (!cloudFunctions || eliminando) return;
    const confirmado = window.confirm(
      `¿Eliminar el reporte de ${informe.mesLabel}? Se borra el PDF de R2 y no se puede deshacer.`
    );
    if (!confirmado) return;
    setMenuAbierto(false);
    setEliminando(true);
    setError("");
    try {
      const eliminarReporteCliente = httpsCallable<{ clienteId: string; mes: string }, { ok: boolean }>(
        cloudFunctions,
        "eliminarReporteCliente"
      );
      await eliminarReporteCliente({ clienteId, mes: informe.mes });
      onEliminado?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el reporte.");
    } finally {
      setEliminando(false);
    }
  }

  return (
    <div className="report-card">
      {isAdmin && (
        <div className="report-card-menu">
          <button
            type="button"
            className="report-card-menu-btn"
            aria-label="Opciones del reporte"
            onClick={() => setMenuAbierto((actual) => !actual)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.9" />
              <circle cx="12" cy="12" r="1.9" />
              <circle cx="12" cy="19" r="1.9" />
            </svg>
          </button>
          {menuAbierto && (
            <div className="report-card-menu-dropdown">
              <button
                type="button"
                className="report-card-menu-item"
                onClick={() => void eliminarReporte()}
                disabled={eliminando}
              >
                {eliminando ? "Eliminando..." : "Eliminar reporte"}
              </button>
            </div>
          )}
        </div>
      )}
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
          <div className="report-meta">Generado el {fechaGenerada(informe.mes, informe.dia)}</div>
          {tamano && <div className="report-meta">Tamaño: {tamano}</div>}
        </div>
        <div className="report-ready-badge">Listo</div>
      </div>
      {error && (
        <div className="report-admin-status error" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}
      <div className="report-actions">
        <button type="button" className="report-action report-action-primary" onClick={verYDescargar}>
          Ver / Descargar
        </button>
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
}
