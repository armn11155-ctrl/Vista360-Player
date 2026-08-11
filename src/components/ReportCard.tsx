import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { cloudFunctions } from "../config/firebase";
import { useSignedUrls } from "../hooks/useSignedUrls";
import { saludoPorHora } from "../utils/fechas";
import { archivoABase64, compartirArchivoPrecargado, motivoSinCompartirArchivo, precargarArchivoR2, puedeCompartirEsteArchivo } from "../utils/compartirArchivo";
import { guardarArchivoYaCargado } from "../utils/descargarArchivo";
import { mensajeDeError } from "../utils/errores";
import type { Cliente, InformeCliente } from "../types";
import { useDialogos } from "./DialogosProvider";
import { descargarArchivo, verArchivo } from "../utils/descargarArchivo";

interface Props {
  informe: InformeCliente;
  cliente: Cliente | null;
  clienteId: string;
  isAdmin?: boolean;
  /** Se llama despues de eliminar el reporte con exito, para que el
   *  que lo use (Reportes.tsx, DetalleCampana.tsx) refresque su lista. */
  onEliminado?: () => void;
}

// Ver y Descargar suelen pulsarse uno después del otro. Ambos deben marcar
// el reporte, pero una sola llamada alcanza: el estado vive en el backend y
// no cambia por volver a abrir el mismo PDF durante esta sesión.
const REPORTES_MARCADOS_EN_SESION = new Set<string>();

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
/**
 * Numero del cliente en el formato que pide wa.me: solo digitos, con
 * codigo de pais y sin el "+".
 *
 * Si el celular guardado tiene 9 digitos se asume Peru (51), que es como
 * se guardan hoy. Si ya trae codigo de pais se respeta tal cual.
 */
function numeroWhatsApp(cliente: Cliente | null): string {
  const soloDigitos = (cliente?.celular ?? "").replace(/\D/g, "");
  if (!soloDigitos) return "";
  return soloDigitos.length === 9 ? `51${soloDigitos}` : soloDigitos;
}

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

/**
 * Nombre del PDF de un reporte, UNO SOLO para todos los caminos.
 *
 * Había tres nombres distintos para el mismo archivo, según por dónde se
 * pidiera: "Reporte 2026-08.pdf" al descargar (usaba el mes crudo),
 * "Reporte-17-Jun-2026.pdf" al compartir (guiones), y
 * "Reporte 05 Ago 2026.pdf" en la URL firmada del servidor.
 *
 * Se unifica en el del servidor, que además es el mismo formato que usan
 * ahora las facturas: en la misma carpeta, reportes y facturas se ordenan
 * y se reconocen igual.
 */
function nombreArchivoReporte(mesLabel: string) {
  const limpio = (mesLabel || "").replace(/[^\p{L}\p{N} -]/gu, "").replace(/\s+/g, " ").trim();
  return `Reporte ${limpio || "Vista360"}.pdf`;
}

/**
 * Tarjeta de un reporte PDF generado — mismo diseño en la pantalla
 * principal de Reportes y dentro del detalle de cada campaña (pestaña
 * Reportes), para que se vea igual en los dos lados.
 */
export function ReportCard({ informe, cliente, clienteId, isAdmin, onEliminado }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { confirmar } = useDialogos();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  // El botón muestra "Descargando…" mientras trae el archivo: en el
  // móvil la espera se nota y sin aviso parece que no hizo nada.
  const [descargando, setDescargando] = useState(false);
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState<"whatsapp" | "correo" | null>(null);
  const [archivoCompartir, setArchivoCompartir] = useState<File | null>(null);
  const [archivoError, setArchivoError] = useState("");
  const [previaCorreo, setPreviaCorreo] = useState(false);
  const [correoEnviadoOk, setCorreoEnviadoOk] = useState("");

  // listarReportesCliente ya entrega una URL firmada. Solo se pide otra
  // firma para documentos antiguos que no la incluyan; antes cada tarjeta
  // repetía esta llamada aunque ya tuviera una URL perfectamente válida.
  const keysAFirmar = informe.r2Keys && !informe.urlDigital && !informe.url
    ? [informe.r2Keys.digital]
    : [];
  const urlsFirmadas = useSignedUrls(keysAFirmar);
  const url = (informe.r2Keys && urlsFirmadas[informe.r2Keys.digital]) || informe.urlDigital || informe.url;

  const mensajeConArchivo = mensajeReporteConArchivo(informe.mesLabel, cliente);
  const mensajeConLink = mensajeReporteConLink(informe.mesLabel, cliente, url);
  const emailSubject = `Reporte ${informe.mesLabel} - Vista360`;
  const emailTo = cliente?.email ?? "";
  const tamano = formatoBytes(informe.digitalBytes);

  /** Precarga el PDF apenas se puede (no en el clic) -- ver el
   *  comentario largo en utils/compartirArchivo.ts sobre por qué.
   *  Usa la MISMA url firmada que ya usan "Ver"/"Descargar" (fetch()
   *  directo, sin Cloud Function -- necesita CORS habilitado en el
   *  bucket, ver scripts/set-r2-cors.mjs). */
  useEffect(() => {
    if (!isAdmin || !url) return;
    const card = cardRef.current;
    const controller = new AbortController();
    let iniciado = false;
    const iniciar = () => {
      if (iniciado) return;
      iniciado = true;
      precargarArchivoR2(url, nombreArchivoReporte(informe.mesLabel), controller.signal)
        .then(({ archivo, error }) => {
          if (controller.signal.aborted) return;
          setArchivoCompartir(archivo);
          setArchivoError(error ?? "");
        });
    };
    const observer = card && typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([entry]) => {
          if (entry?.isIntersecting) {
            iniciar();
            observer?.disconnect();
          }
        }, { rootMargin: "120px" })
      : null;
    if (observer && card) observer.observe(card);
    else iniciar();
    return () => {
      observer?.disconnect();
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, url]);

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
    if (canal === "correo") {
      setError("");
      setCorreoEnviadoOk("");
      setPreviaCorreo(true);
      return;
    }
    if (puedeCompartirEsteArchivo(archivoCompartir)) {
      setEnviando("whatsapp");
      compartirArchivoPrecargado(archivoCompartir, mensajeConArchivo, emailSubject)
        .then((compartido) => {
          if (!compartido) irAlLink("whatsapp");
        })
        .finally(() => setEnviando(null));
      // TOPE DE SEGURIDAD. El panel nativo devuelve una promesa que solo
      // se resuelve cuando la persona lo cierra. Si por lo que sea no
      // llega nunca (paso en macOS: la hoja del sistema dejaba el boton
      // en "Enviando..." indefinidamente), el estado se limpia solo a los
      // 60 s en vez de dejar el boton muerto hasta recargar.
      window.setTimeout(() => setEnviando((actual) => (actual === "whatsapp" ? null : actual)), 60_000);
      return;
    }
    // ESCRITORIO. WhatsApp Web no deja adjuntar por enlace -- solo acepta
    // texto -- asi que se hacen las dos cosas que si se pueden:
    //
    //   1. se abre el chat DEL CLIENTE con el mensaje ya escrito;
    //   2. se baja el PDF, que queda el primero en "Recientes" del
    //      selector de archivos.
    //
    // La persona pulsa el clip, elige el archivo que acaba de bajar y lo
    // manda. El texto usado es el de "con archivo": NO lleva la url
    // firmada de R2, porque el PDF va adjunto de verdad.
    //
    // El orden importa: primero window.open, que depende del gesto del
    // clic, y despues la descarga, que no.
    // El chat del cliente se abre SIEMPRE con el texto sin la url firmada,
    // y el PDF se baja aparte.
    //
    // Antes esto dependia de `archivoCompartir`, y en escritorio ese File
    // llega vacio: precargarArchivoR2 hace fetch a la url firmada de R2
    // desde el navegador y lo bloquea CORS -- que es justo el motivo de que
    // exista obtenerArchivoR2Base64. Como venia null, se caia al camino
    // viejo: ni se bajaba el PDF ni se limpiaba el enlace del mensaje.
    //
    // descargarArchivo() no tiene ese problema (ya se usa en el boton
    // Descargar y funciona en escritorio). Primero window.open, que
    // depende del gesto del clic; despues la descarga, que no.
    irAlLink("whatsapp", mensajeConArchivo);
    if (archivoCompartir) {
      guardarArchivoYaCargado(archivoCompartir);
      return;
    }
    void descargarArchivo(informe.urlDescarga || url, nombreArchivoReporte(informe.mesLabel));
  }

  /** A diferencia de WhatsApp (que SIEMPRE depende de que la persona
   *  elija un contacto/app a mano, sin excepción -- ver la nota larga
   *  en utils/compartirArchivo.ts), el correo SÍ se puede mandar
   *  armado del todo desde el backend: destinatario, asunto, mensaje
   *  y PDF adjunto en un solo clic, sin panel nativo ni pasos
   *  manuales. Usa el PDF ya precargado (mismo que WhatsApp), solo
   *  que convertido a base64 para poder mandarlo en el body de la
   *  Cloud Function callable.
   *
   *  Antes, si algo fallaba (sin correo guardado, sin PDF listo, error
   *  de la función), caía en SILENCIO al link de mailto: -- se abría
   *  el correo PERSONAL de quien lo usaba, sin ningún aviso de que
   *  algo había fallado ni por qué. Ahora, si falla, se muestra el
   *  motivo real acá mismo y la persona decide: reintentar, o usar el
   *  link a propósito con el botón de abajo -- nunca de sorpresa. */
  async function confirmarEnvioCorreo() {
    if (!cloudFunctions) {
      setError("Firebase Functions no está configurado.");
      return;
    }
    if (!emailTo) {
      setError("Este cliente no tiene un correo guardado.");
      return;
    }
    if (!archivoCompartir) {
      setError(diagnosticoCompartir || "El PDF todavía no está listo. Espera un momento e intenta de nuevo.");
      return;
    }
    setEnviando("correo");
    setError("");
    try {
      const archivoBase64 = await archivoABase64(archivoCompartir);
      const enviar = httpsCallable<
        { destinatario: string; asunto: string; mensaje: string; archivoBase64: string; nombreArchivo: string },
        { ok: boolean; bytesAdjunto?: number }
      >(cloudFunctions, "enviarCorreoConPdf");
      const resultado = await enviar({
        destinatario: emailTo,
        asunto: emailSubject,
        mensaje: mensajeConArchivo,
        archivoBase64,
        nombreArchivo: archivoCompartir.name,
      });
      const bytesTexto = formatoBytes(resultado.data?.bytesAdjunto);
      setCorreoEnviadoOk(`Correo enviado a ${emailTo}${bytesTexto ? ` con el PDF adjunto (${bytesTexto})` : ""}.`);
      setPreviaCorreo(false);
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo enviar el correo. Intenta de nuevo en un momento."));
    }
    setEnviando(null);
  }

  function usarLinkComoRespaldo() {
    setPreviaCorreo(false);
    setError("");
    irAlLink("correo");
  }

  function irAlLink(canal: "whatsapp" | "correo", texto = mensajeConLink) {
    if (canal === "correo") {
      window.location.href = `mailto:${emailTo}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(mensajeConLink)}`;
    } else {
      // Al chat DEL CLIENTE si tenemos su celular: asi no hay que
      // buscarlo en la lista de contactos.
      const numero = numeroWhatsApp(cliente);
      const destino = numero ? `https://wa.me/${numero}` : "https://wa.me/";
      window.open(`${destino}?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
    }
  }

  /** Ver y Descargar reutilizan el mismo Blob ya precargado. Mantener dos
   *  botones reales evita bloqueos de ventanas en navegadores móviles. */
  // Intentar disparar dos acciones (ver + descargar) desde un solo
  // clic con JavaScript lo terminan bloqueando los navegadores de
  // celular de una forma u otra (window.open programado, o un segundo
  // <a> clickeado a mano) -- por más que se reordene, algún navegador
  // se queda solo con una. La solución que SIEMPRE funciona: dos
  // botones de verdad, cada uno un <a> normal sin trucos.

  async function eliminarReporte() {
    if (!cloudFunctions || eliminando) return;
    const confirmado = await confirmar({
      titulo: "¿Eliminar este reporte?",
      mensaje: `Se borrará el reporte de ${informe.mesLabel} junto con su PDF. No se puede deshacer.`,
      textoConfirmar: "Eliminar",
      destructivo: true,
    });
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
    const clave = `${clienteId}:${informe.id}`;
    if (REPORTES_MARCADOS_EN_SESION.has(clave)) return;
    REPORTES_MARCADOS_EN_SESION.add(clave);
    const marcarReporteVisto = httpsCallable<{ clienteId: string; informeId: string }, { ok: boolean }>(
      cloudFunctions,
      "marcarReporteVisto"
    );
    marcarReporteVisto({ clienteId, informeId: informe.id }).catch(() => {
      // Si falló por red, un toque posterior sí puede reintentarlo.
      REPORTES_MARCADOS_EN_SESION.delete(clave);
    });
  }

  return (
    <div ref={cardRef} className="report-card">
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
        <button
          type="button"
          className="report-action report-action-primary"
          disabled={abriendo}
          onClick={() => {
            marcarVisto();
            setAbriendo(true);
            void verArchivo(url, nombreArchivoReporte(informe.mesLabel)).finally(() => setAbriendo(false));
          }}
        >
          {abriendo ? "Abriendo…" : "Ver"}
        </button>
        <button
          type="button"
          className="report-action report-action-download"
          disabled={descargando}
          onClick={() => {
            marcarVisto();
            setDescargando(true);
            // La descarga ya crea un Blob local y le pone el nombre
            // correcto. Usar la misma URL de Ver permite reutilizar el
            // PDF precargado en vez de bajar una segunda copia desde una
            // URL distinta solo por Content-Disposition.
            void descargarArchivo(url, nombreArchivoReporte(informe.mesLabel))
              .finally(() => setDescargando(false));
          }}
        >
          {descargando ? "Descargando…" : "Descargar"}
        </button>
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
      {isAdmin && previaCorreo && (
        <div className="report-email-preview">
          <div className="report-email-preview-row"><span>Para</span><strong>{emailTo || "(sin correo guardado)"}</strong></div>
          <div className="report-email-preview-row"><span>Asunto</span><strong>{emailSubject}</strong></div>
          <div className="report-email-preview-row report-email-preview-mensaje"><span>Mensaje</span><p>{mensajeConArchivo}</p></div>
          <div className={`report-email-preview-chip ${archivoCompartir ? "is-ok" : "is-warn"}`}>
            {archivoCompartir ? "PDF adjunto listo" : "PDF todavía no está listo"}
          </div>
          <div className="report-email-preview-actions">
            <button type="button" className="cancelar" onClick={() => { setPreviaCorreo(false); setError(""); }} disabled={enviando !== null}>
              Cancelar
            </button>
            <button type="button" className="enviar" onClick={() => void confirmarEnvioCorreo()} disabled={enviando !== null}>
              {enviando === "correo" ? "Enviando…" : "Enviar"}
            </button>
          </div>
          <button type="button" className="report-email-preview-fallback" onClick={usarLinkComoRespaldo}>
            Prefiero mandar solo el link
          </button>
        </div>
      )}
      {isAdmin && !previaCorreo && correoEnviadoOk && (
        <div className="report-email-enviado-ok">{correoEnviadoOk}</div>
      )}
      {isAdmin && !previaCorreo && diagnosticoCompartir && (
        <div className="report-share-diagnostico">Adjunto no disponible ({diagnosticoCompartir}) — Correo/WhatsApp mandan el link.</div>
      )}
    </div>
  );
}
