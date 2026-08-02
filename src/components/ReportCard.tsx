import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { cloudFunctions } from "../config/firebase";
import { useSignedUrls } from "../hooks/useSignedUrls";
import { saludoPorHora } from "../utils/fechas";
import { compartirArchivoPrecargado, motivoSinCompartirArchivo, precargarArchivoR2, puedeCompartirEsteArchivo } from "../utils/compartirArchivo";
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
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${date.getDate()} de ${meses[date.getMonth()]} de ${date.getFullYear()}`;
}

function fechaGenerada(mes: string, dia?: string) {
  const diaValido = /^\d{1,2}$/.test(dia ?? "") ? String(dia).padStart(2, "0") : "01";
  const base = mes || new Date().toISOString().slice(0, 7);
  const fecha = new Date(`${base}-${diaValido}T12:00:00`);
  return fechaCorta(Number.isNaN(fecha.getTime()) ? new Date() : fecha);
}

function formatoBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return null;
  // Base decimal (1000), no binaria (1024) -- ver nota en
  // prepararFacturaPdf.ts: asi el numero coincide con el tamano que
  // muestra el telefono/compu del archivo ya descargado.
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** Mensaje cuando el PDF va adjunto de verdad (Web Share) -- no hace
 *  falta un link al PDF, el archivo ya viene con el mensaje. Se pidió
 *  que igual quede el link al portal, abajo, como respaldo/consulta
 *  general (no es el link del PDF puntual, es la puerta de entrada). */
function mensajeReporteConArchivo(mesLabel: string, cliente: Cliente | null) {
  const nombre = nombreCliente(cliente);
  return [
    `${saludoPorHora()} ${nombre}, te comparto tu reporte de ${mesLabel} de Vista360.`,
    "",
    "Aquí tienes el PDF, listo para revisar cuando gustes.",
    "",
    "También disponible en tu portal Vista360 Player:",
    window.location.origin,
  ].join("\n");
}

/** Mensaje de respaldo cuando no se pudo adjuntar el archivo (por
 *  ejemplo, en computadora) -- ahí sí hace falta el link puntual al
 *  PDF, además del link al portal. */
function mensajeReporteConLink(mesLabel: string, cliente: Cliente | null, url: string) {
  const nombre = nombreCliente(cliente);
  return [
    `${saludoPorHora()} ${nombre}, te comparto tu reporte de ${mesLabel} de Vista360.`,
    "",
    `Puedes revisarlo aquí: ${url}`,
    "",
    "También disponible en tu portal Vista360 Player:",
    window.location.origin,
  ].join("\n");
}

/** Nombre de archivo para el PDF compartido -- mismo mesLabel que se
 *  muestra en la tarjeta ("17 Jun 2026"), sin caracteres raros. */
function nombreArchivoReporte(mesLabel: string) {
  const limpio = mesLabel.replace(/[^\p{L}\p{N} -]/gu, "").trim().replace(/\s+/g, "-");
  return `Reporte-${limpio || "Vista360"}.pdf`;
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
  const [enviando, setEnviando] = useState<"whatsapp" | "correo" | null>(null);
  const [archivoCompartir, setArchivoCompartir] = useState<File | null>(null);
  const [archivoError, setArchivoError] = useState("");

  const keysAFirmar = informe.r2Keys ? [informe.r2Keys.digital] : [];
  const urlsFirmadas = useSignedUrls(keysAFirmar);
  const url = (informe.r2Keys && urlsFirmadas[informe.r2Keys.digital]) || informe.urlDigital || informe.url;

  const mensajeConArchivo = mensajeReporteConArchivo(informe.mesLabel, cliente);
  const mensajeConLink = mensajeReporteConLink(informe.mesLabel, cliente, url);
  const emailSubject = `Reporte ${informe.mesLabel} - Vista360`;
  const emailTo = cliente?.email ?? "";
  const tamano = formatoBytes(informe.digitalBytes);

  /** Precarga el PDF apenas se puede (no en el clic) -- ver el
   *  comentario largo en utils/compartirArchivo.ts sobre por qué:
   *  pedirlo recién en el clic dejaba el share() (y su respaldo)
   *  sin activación fresca en celular, y se quedaban sin hacer nada. */
  useEffect(() => {
    if (!isAdmin) return;
    const key = informe.r2Keys?.digital;
    if (!key) return;
    let cancelado = false;
    precargarArchivoR2(key, nombreArchivoReporte(informe.mesLabel)).then(({ archivo, error }) => {
      if (cancelado) return;
      setArchivoCompartir(archivo);
      setArchivoError(error ?? "");
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, informe.r2Keys?.digital]);

  // Diagnostico visible SOLO para el admin -- para saber sin entrar a
  // la consola del navegador por que un dispositivo en particular cae
  // al link en vez de adjuntar el PDF de verdad.
  const diagnosticoCompartir = !archivoCompartir
    ? archivoError
    : motivoSinCompartirArchivo(archivoCompartir);

  /** El clic llama a compartir de inmediato (síncrono, sin await
   *  antes) si el archivo ya está precargado y el navegador lo
   *  soporta; si no, cae directo al link, también de inmediato --
   *  nunca hay una espera de red DENTRO del clic. */
  function compartirPorCanal(canal: "whatsapp" | "correo") {
    if (enviando) return;
    if (puedeCompartirEsteArchivo(archivoCompartir)) {
      setEnviando(canal);
      compartirArchivoPrecargado(archivoCompartir, mensajeConArchivo, emailSubject)
        .then((compartido) => {
          if (!compartido) irAlLink(canal);
        })
        .finally(() => setEnviando(null));
      return;
    }
    irAlLink(canal);
  }

  function irAlLink(canal: "whatsapp" | "correo") {
    if (canal === "correo") {
      window.location.href = `mailto:${emailTo}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(mensajeConLink)}`;
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(mensajeConLink)}`, "_blank", "noopener,noreferrer");
    }
  }

  /** El admin pidió que un solo botón haga las dos cosas: descargar el
   *  PDF Y también llevarlo a la página donde se ve en el navegador.
   *  Son dos URLs firmadas de la misma key -- una pensada para verse
   *  (url) y otra que fuerza la descarga con Content-Disposition:
   *  attachment (informe.urlDescarga, ver listarReportesCliente.ts). */
  // Intentar disparar dos acciones (ver + descargar) desde un solo
  // clic con JavaScript lo terminan bloqueando los navegadores de
  // celular de una forma u otra (window.open programado, o un segundo
  // <a> clickeado a mano) -- por más que se reordene, algún navegador
  // se queda solo con una. La solución que SIEMPRE funciona: dos
  // botones de verdad, cada uno un <a> normal sin trucos.

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
      const eliminarReporteCliente = httpsCallable<{ clienteId: string; mes: string; dia?: string }, { ok: boolean }>(
        cloudFunctions,
        "eliminarReporteCliente"
      );
      await eliminarReporteCliente({ clienteId, mes: informe.mes, dia: informe.dia });
      onEliminado?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el reporte.");
    } finally {
      setEliminando(false);
    }
  }

  /** Se dispara cuando el CLIENTE (nunca el admin) toca "Ver" o
   *  "Descargar" -- avisa al backend que ya revisó este reporte, para
   *  que el admin lo vea reflejado en su lista. No bloquea el enlace
   *  (sin preventDefault): si falla, el cliente igual ve/descarga su
   *  PDF con normalidad, solo no queda marcado como visto. */
  function marcarVisto() {
    if (isAdmin || !cloudFunctions) return;
    const marcarReporteVisto = httpsCallable<{ clienteId: string; informeId: string }, { ok: boolean }>(
      cloudFunctions,
      "marcarReporteVisto"
    );
    marcarReporteVisto({ clienteId, informeId: informe.id }).catch(() => undefined);
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
          <div className="report-kicker">{informe.contratoNombre || "Reporte mensual"}</div>
          <div className="report-title">{informe.mesLabel}</div>
          <div className="report-meta report-meta-generated">Generado el {fechaGenerada(informe.mes, informe.dia)}</div>
          {tamano && <div className="report-meta report-meta-size">Tamaño: {tamano}</div>}
          {isAdmin && (
            <div className={`report-meta report-seen-status ${informe.vistoPorCliente ? "is-seen" : "is-unseen"}`}>
              {informe.vistoPorCliente
                ? `Visto por el cliente${informe.vistoEn ? ` · ${fechaCorta(new Date(informe.vistoEn))}` : ""}`
                : "Aún no visto por el cliente"}
            </div>
          )}
        </div>
        <div className="report-ready-badge">Listo</div>
      </div>
      {error && (
        <div className="report-admin-status error" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}
      <div className="report-actions">
        <a className="report-action report-action-primary" href={url} target="_blank" rel="noreferrer" onClick={marcarVisto}>
          Ver
        </a>
        <a
          className="report-action report-action-download"
          href={informe.urlDescarga || url}
          download
          rel="noreferrer"
          onClick={marcarVisto}
        >
          Descargar
        </a>
        {isAdmin && (
          <>
            <button
              type="button"
              className="report-action report-action-muted"
              onClick={() => void compartirPorCanal("correo")}
              disabled={enviando !== null}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m4 7 8 6 8-6" />
              </svg>
              {enviando === "correo" ? "Enviando…" : "Correo"}
            </button>
            <button
              type="button"
              className="report-action report-action-muted report-action-whatsapp"
              onClick={() => void compartirPorCanal("whatsapp")}
              disabled={enviando !== null}
            >
              <img className="report-whatsapp-icon" src="/whatsapp-svgrepo-com.svg" alt="" aria-hidden="true" />
              {enviando === "whatsapp" ? "Enviando…" : "WhatsApp"}
            </button>
          </>
        )}
      </div>
      {isAdmin && diagnosticoCompartir && (
        <div className="report-share-diagnostico">Adjunto no disponible ({diagnosticoCompartir}) — Correo/WhatsApp mandan el link.</div>
      )}
    </div>
  );
}
