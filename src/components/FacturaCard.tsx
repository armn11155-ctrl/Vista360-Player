import { useCallback, useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { cloudFunctions } from "../config/firebase";
import { useSignedUrls } from "../hooks/useSignedUrls";
import { saludoPorHora } from "../utils/fechas";
import { archivoABase64, compartirArchivoPrecargado, motivoSinCompartirArchivo, precargarArchivoR2, puedeCompartirEsteArchivo } from "../utils/compartirArchivo";
import { mensajeDeError } from "../utils/errores";
import type { Cliente, Factura, FacturaEstado } from "../types";
import { useDialogos } from "./DialogosProvider";
import { descargarArchivo, verArchivo } from "../utils/descargarArchivo";

interface Props {
  factura: Factura;
  cliente: Cliente | null;
  isAdmin?: boolean;
}

const VIGENCIA_DESCARGA_MS = 5 * 60 * 60_000;
const CACHE_DESCARGAS = new Map<string, { url: string; expiraEn: number }>();

const BADGE: Record<FacturaEstado, { bg: string; color: string }> = {
  Pagada: { bg: "rgba(34,197,94,0.15)", color: "#16A34A" },
  Aceptada: { bg: "rgba(34,197,94,0.15)", color: "#16A34A" },
  Emitida: { bg: "rgba(34,197,94,0.15)", color: "#16A34A" },
  Pendiente: { bg: "rgba(124,58,237,0.15)", color: "#7C3AED" },
  Vencida: { bg: "rgba(239,68,68,0.15)", color: "#DC2626" },
  Rechazada: { bg: "rgba(239,68,68,0.15)", color: "#DC2626" },
  Anulada: { bg: "rgba(107,114,128,0.12)", color: "#64748B" },
  Borrador: { bg: "rgba(107,114,128,0.12)", color: "#64748B" },
};

function nombreCliente(cliente: Cliente | null) {
  return cliente?.empresa || cliente?.contacto || "cliente";
}

/**
 * Tamaño de letra del nombre segun cuanto texto haya -- el nombre sale
 * del nombre del PDF que se sube, puede ser corto ("F001-123") o muy
 * largo ("Factura de servicios de publicidad exterior - Julio 2026").
 * Antes el tamaño era fijo (y encima con reglas de CSS que competian
 * entre si en distintos anchos de pantalla, sin ganador consistente) --
 * ahora se calcula segun el largo real del texto y se aplica inline,
 * asi siempre entra bien sin cortarse ni verse forzado.
 */
function tamanoTitulo(texto: string): number {
  const len = texto.length;
  if (len <= 14) return 20;
  if (len <= 22) return 18;
  if (len <= 30) return 16;
  if (len <= 40) return 14.5;
  return 13;
}

function formatoBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return null;
  // Base decimal (1000), no binaria (1024) -- ver nota en
  // prepararFacturaPdf.ts: asi el numero coincide con el tamano que
  // muestra el telefono/compu del archivo ya descargado.
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

// ── Fecha "Generado el ..." -- mismo formato y misma frase que usa
// ReportCard.tsx para los reportes, para que las dos tarjetas se vean
// consistentes. fecha_emision no tiene un formato único garantizado
// (ver misma nota en Facturas.tsx/anioMesDeFactura): ISO (YYYY-MM-DD)
// para las facturas subidas desde Vista360 Player, o DD/MM/YYYY para
// las que llegan del sistema externo facturacion-web. Si no calza
// ninguno, se muestra el texto crudo tal cual venga (o "—" si no hay
// fecha), en vez de romper la tarjeta.
function fechaCorta(date: Date) {
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${date.getDate()} de ${meses[date.getMonth()]} de ${date.getFullYear()}`;
}

function fechaDeFactura(fecha?: string): Date | null {
  if (!fecha) return null;
  const iso = fecha.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const ddmmyyyy = fecha.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    const d = new Date(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** No se menciona el monto en el mensaje -- todavia no se registra un
 *  monto real por factura subida desde aca, y decir "$ 0.00" se veia
 *  mal tanto en la tarjeta como en el mensaje.
 *
 *  Mismo tono y misma estructura que el mensaje de Reporte (premium,
 *  elegante, sin relleno generico), y misma logica de dos variantes:
 *  con el PDF adjunto de verdad (Web Share, no hace falta el link
 *  puntual) o con el link como respaldo. Las dos cierran con el link
 *  al portal. */
function mensajeFacturaConArchivo(f: Factura, cliente: Cliente | null) {
  const nombre = nombreCliente(cliente);
  const numero = f.numero_fmt || f.serie || "tu factura";
  return [
    `${saludoPorHora()} ${nombre}, te comparto la factura ${numero} de Vista360.`,
    "",
    "Aquí tienes el PDF, listo para revisar cuando gustes.",
    "",
    "También disponible en tu portal Vista360 Player:",
    window.location.origin,
  ].join("\n");
}

function mensajeFacturaConLink(f: Factura, cliente: Cliente | null, url: string) {
  const nombre = nombreCliente(cliente);
  const numero = f.numero_fmt || f.serie || "tu factura";
  return [
    `${saludoPorHora()} ${nombre}, te comparto la factura ${numero} de Vista360.`,
    "",
    `Puedes revisarla aquí: ${url}`,
    "",
    "También disponible en tu portal Vista360 Player:",
    window.location.origin,
  ].join("\n");
}

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/**
 * Nombre del PDF al descargar o ver una factura.
 *
 * Mismo formato que los reportes ("Reporte 05 Ago 2026.pdf"), que es el
 * que se pidió: guardadas en la misma carpeta, las dos cosas se ordenan
 * y se reconocen igual. Antes salía "F001-123.pdf", que no dice nada
 * sobre cuándo es sin abrirlo.
 *
 * Si la factura no trae fecha de emisión se cae al número, que es el
 * único identificador que queda: peor nombre, pero nunca un archivo
 * llamado "undefined".
 */
function nombreArchivoFactura(f: Factura) {
  const fecha = fechaDeFactura(f.fecha_emision);
  if (fecha) {
    const dia = String(fecha.getDate()).padStart(2, "0");
    return `Factura ${dia} ${MESES_CORTOS[fecha.getMonth()]} ${fecha.getFullYear()}.pdf`;
  }
  const base = f.numero_fmt || f.serie || "Vista360";
  const limpio = base.replace(/[^\p{L}\p{N} -]/gu, "").trim().replace(/\s+/g, "-");
  return `Factura ${limpio || "Vista360"}.pdf`;
}

/**
 * Tarjeta de una factura -- mismo diseño (layout, tamaños, tipografía)
 * que ReportCard, para que se sienta parte de la misma app, pero con
 * su propio color (rojo vino, premium/elegante, no naranja) e ícono
 * de documento con "FACTURA" dibujado dentro (no como texto aparte
 * debajo), para que a simple vista se note que es otra cosa. Igual
 * que los reportes, deja enviar por WhatsApp y Correo.
 */
export function FacturaCard({ factura: f, cliente, isAdmin }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { confirmar } = useDialogos();
  const esKeyR2 = Boolean(f.pdfUrl) && !f.pdfUrl!.startsWith("http");
  const keysAFirmar = esKeyR2 ? [f.pdfUrl!] : [];
  const urlsFirmadas = useSignedUrls(keysAFirmar);
  const urlVer = f.pdfUrl ? (esKeyR2 ? urlsFirmadas[f.pdfUrl!] : f.pdfUrl) : undefined;

  const descargaCacheada = f.pdfUrl ? CACHE_DESCARGAS.get(f.pdfUrl) : undefined;
  const [urlDescarga, setUrlDescarga] = useState(() =>
    descargaCacheada && descargaCacheada.expiraEn > Date.now() ? descargaCacheada.url : ""
  );
  const [descargando, setDescargando] = useState(false);
  const [abriendo, setAbriendo] = useState(false);

  // ── Editar el nombre (numero_fmt) que se muestra -- el lapicito al
  // costado del badge de estado abre este editor inline. Pasa por
  // actualizarNombreFactura (Admin SDK) por el mismo motivo que
  // crearFacturaAdmin: "facturas" es de facturacion-web, un sistema
  // aparte, y sus reglas no dejan escribir desde acá directo. ──
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombreEdit, setNombreEdit] = useState("");
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const [errorNombre, setErrorNombre] = useState("");

  // ── Menu de tres puntos (Editar / Eliminar) -- antes solo habia un
  // lapicito que abria directo el editor de nombre; se pidio que en
  // su lugar haya un menu con las dos opciones, mismo patron que ya
  // usa Paneles.tsx para su menu de opciones. ──
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState("");
  const [errorCorreo, setErrorCorreo] = useState("");
  const [previaCorreo, setPreviaCorreo] = useState(false);
  const [correoEnviadoOk, setCorreoEnviadoOk] = useState("");
  const [enviando, setEnviando] = useState<"whatsapp" | "correo" | null>(null);
  const [archivoCompartir, setArchivoCompartir] = useState<File | null>(null);
  const [archivoError, setArchivoError] = useState("");

  /** Precarga el PDF apenas se puede (no en el clic) -- mismo motivo
   *  que ReportCard.tsx: ver el comentario largo en
   *  utils/compartirArchivo.ts. Usa urlVer tal cual -- ya sea la url
   *  firmada de R2 o (facturas viejas) la url externa de
   *  facturacion-web; si esa segunda no tiene CORS habilitado el
   *  fetch() va a fallar solo, y cae al link con el motivo mostrado
   *  en el diagnostico, en vez de descartarse de antemano. */
  useEffect(() => {
    if (!isAdmin || !urlVer) return;
    const card = cardRef.current;
    const controller = new AbortController();
    let iniciado = false;
    const iniciar = () => {
      if (iniciado) return;
      iniciado = true;
      precargarArchivoR2(urlVer, nombreArchivoFactura(f), controller.signal)
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
  }, [isAdmin, urlVer]);

  // Diagnostico visible SOLO para el admin -- mismo motivo que en
  // ReportCard.tsx.
  const diagnosticoCompartir = !archivoCompartir
    ? archivoError
    : motivoSinCompartirArchivo(archivoCompartir);

  function abrirEdicionNombre() {
    setMenuAbierto(false);
    setNombreEdit(f.numero_fmt ?? f.serie ?? "");
    setErrorNombre("");
    setEditandoNombre(true);
  }

  async function eliminarFactura() {
    if (!cloudFunctions) {
      setErrorEliminar("Firebase Functions no está configurado.");
      return;
    }
    const confirmado = await confirmar({
      titulo: "¿Eliminar esta factura?",
      mensaje: `Se eliminará la factura "${f.numero_fmt ?? f.serie ?? "sin número"}". No se puede deshacer.`,
      textoConfirmar: "Eliminar",
      destructivo: true,
    });
    if (!confirmado) return;
    setMenuAbierto(false);
    setErrorEliminar("");
    setEliminando(true);
    try {
      const fn = httpsCallable<{ facturaId: string }, { ok: boolean }>(cloudFunctions, "eliminarFactura");
      await fn({ facturaId: f.id });
    } catch (err) {
      setErrorEliminar(err instanceof Error ? err.message : "No se pudo eliminar la factura.");
      setEliminando(false);
    }
  }

  function cancelarEdicionNombre() {
    setEditandoNombre(false);
    setErrorNombre("");
  }

  async function guardarNombre() {
    if (!cloudFunctions) {
      setErrorNombre("Firebase Functions no está configurado.");
      return;
    }
    const valor = nombreEdit.trim();
    if (!valor) {
      setErrorNombre("El nombre no puede quedar vacío.");
      return;
    }
    setGuardandoNombre(true);
    setErrorNombre("");
    try {
      const fn = httpsCallable<{ facturaId: string; numeroFmt: string }, { ok: boolean }>(
        cloudFunctions,
        "actualizarNombreFactura"
      );
      await fn({ facturaId: f.id, numeroFmt: valor });
      setEditandoNombre(false);
    } catch (err) {
      setErrorNombre(err instanceof Error ? err.message : "No se pudo guardar el nombre.");
    } finally {
      setGuardandoNombre(false);
    }
  }

  /**
   * La URL de descarga se pide AL PULSAR, no al pintar la tarjeta.
   *
   * ANTES esto vivía en un useEffect: cada tarjeta de factura que
   * aparecía en pantalla llamaba a `firmarDescargaFactura` aunque nadie
   * tocara "Descargar". Y esa función, para un cliente, hace hasta TRES
   * lecturas de Firestore (su ficha de portal, la factura por pdfUrl y
   * el cliente por RUC) antes de firmar nada.
   *
   * Con 20 facturas en pantalla eran 20 invocaciones y hasta 60 lecturas
   * solo por abrir la pantalla, de las que casi ninguna se usaba. Ahora
   * se paga solo por la factura que de verdad se descarga.
   *
   * La URL se guarda por si se pulsa dos veces: la segunda no vuelve a
   * pedirla mientras siga viva.
   */
  const pedirUrlDescarga = useCallback(async (): Promise<string> => {
    if (urlDescarga) return urlDescarga;
    if (!esKeyR2 || !f.pdfUrl || !cloudFunctions) return urlVer ?? "";
    try {
      const fn = httpsCallable<{ key: string; nombre: string }, { url: string }>(
        cloudFunctions,
        "firmarDescargaFactura"
      );
      const res = await fn({ key: f.pdfUrl, nombre: nombreArchivoFactura(f).replace(/\.pdf$/i, "") });
      CACHE_DESCARGAS.set(f.pdfUrl, { url: res.data.url, expiraEn: Date.now() + VIGENCIA_DESCARGA_MS });
      setUrlDescarga(res.data.url);
      return res.data.url;
    } catch {
      // Si falla, el botón usa la misma URL de Ver: peor nombre de
      // archivo, pero nunca un botón muerto.
      return urlVer ?? "";
    }
  }, [urlDescarga, esKeyR2, f, cloudFunctions, urlVer]);

  const nombreFactura = f.numero_fmt ?? f.serie ?? "Sin número";
  const badge = BADGE[f.estado] ?? BADGE.Borrador;
  const tamano = formatoBytes(f.pdfPesoBytes);
  const fechaEmisionDate = fechaDeFactura(f.fecha_emision);
  const mensajeConArchivo = mensajeFacturaConArchivo(f, cliente);
  const mensajeConLink = urlVer ? mensajeFacturaConLink(f, cliente, urlVer) : "";
  const emailSubject = `Factura ${f.numero_fmt ?? f.serie ?? ""} - Vista360`;
  const emailTo = cliente?.email ?? "";

  /** Misma logica que ReportCard.tsx: el clic comparte de inmediato
   *  (sin await antes) si el archivo ya esta precargado y el
   *  navegador lo soporta; si no, cae directo al link, tambien de
   *  inmediato -- nunca hay una espera de red DENTRO del clic (ver
   *  utils/compartirArchivo.ts para el por que). */
  function compartirPorCanal(canal: "whatsapp" | "correo") {
    if (enviando) return;
    if (canal === "correo") {
      setErrorCorreo("");
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
      return;
    }
    irAlLink("whatsapp");
  }

  /** Mismo motivo que ReportCard.tsx: el correo (a diferencia de
   *  WhatsApp) sí se puede mandar armado del todo desde el backend --
   *  destinatario, asunto, mensaje y PDF adjunto en un clic, sin panel
   *  nativo ni pasos manuales. Antes, si algo fallaba, caía en
   *  SILENCIO al link de mailto: (se abría el correo personal de
   *  quien lo usaba, sin aviso). Ahora se muestra el motivo real y se
   *  deja elegir: reintentar, o usar el link a propósito. */
  async function confirmarEnvioCorreo() {
    if (!cloudFunctions) {
      setErrorCorreo("Firebase Functions no está configurado.");
      return;
    }
    if (!emailTo) {
      setErrorCorreo("Este cliente no tiene un correo guardado.");
      return;
    }
    if (!archivoCompartir) {
      setErrorCorreo(diagnosticoCompartir || "El PDF todavía no está listo. Espera un momento e intenta de nuevo.");
      return;
    }
    setEnviando("correo");
    setErrorCorreo("");
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
      setErrorCorreo(mensajeDeError(err, "No se pudo enviar el correo. Intenta de nuevo en un momento."));
    }
    setEnviando(null);
  }

  function usarLinkComoRespaldo() {
    setPreviaCorreo(false);
    setErrorCorreo("");
    irAlLink("correo");
  }

  function irAlLink(canal: "whatsapp" | "correo") {
    if (canal === "correo") {
      window.location.href = `mailto:${emailTo}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(mensajeConLink)}`;
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(mensajeConLink)}`, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div ref={cardRef} className="report-card factura-card">
      <div className="report-card-main">
        <div className="report-pdf-icon factura-pdf-icon" aria-hidden="true">
          <svg width="56" height="70" viewBox="0 0 56 70" fill="none">
            <path
              d="M8 1.5h28L50 15v49A4.5 4.5 0 0 1 45.5 68.5H8A4.5 4.5 0 0 1 3.5 64V6A4.5 4.5 0 0 1 8 1.5Z"
              fill="#0A2447"
              stroke="#3F6FB0"
            />
            <path d="M36 1.5V12A4.5 4.5 0 0 0 40.5 16.5H50" fill="#7FA8E0" fillOpacity=".35" />
            <path d="M13 22h22M13 29h22M13 36h14" stroke="#C7D6EE" strokeWidth="1.8" strokeLinecap="round" />
            <rect x="5" y="49" width="45" height="15" rx="2.5" fill="#0B2E6B" />
            <text
              x="27.5"
              y="59.2"
              textAnchor="middle"
              fontFamily="Helvetica, Arial, sans-serif"
              fontSize="8"
              fontWeight="700"
              fill="#FFFFFF"
              letterSpacing="0.3"
            >
              FACTURA
            </text>
          </svg>
        </div>
        <div className="report-card-copy">
          <div className="report-kicker">Factura</div>
          <div className="report-title" style={{ fontSize: tamanoTitulo(nombreFactura) }}>{nombreFactura}</div>
          <div className="report-meta report-meta-generated">
            {fechaEmisionDate ? `Generado el ${fechaCorta(fechaEmisionDate)}` : (f.fecha_emision ?? "—")}
          </div>
          {tamano && <div className="report-meta report-meta-size">Tamaño: {tamano}</div>}
        </div>
        <div className="factura-badge-row">
          {isAdmin && !editandoNombre && (
            <div className="factura-menu-wrap">
              <button
                type="button"
                className="factura-menu-btn"
                onClick={() => setMenuAbierto((v) => !v)}
                aria-label="Opciones de la factura"
              >
                ⋯
              </button>
              {menuAbierto && (
                <>
                  <div className="factura-menu-overlay" onClick={() => setMenuAbierto(false)} />
                  <div className="factura-menu-dropdown">
                    <button type="button" className="factura-menu-item" onClick={abrirEdicionNombre}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="factura-menu-item factura-menu-item-eliminar"
                      onClick={() => void eliminarFactura()}
                      disabled={eliminando}
                    >
                      {eliminando ? "Eliminando..." : "Eliminar"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          <div className="report-ready-badge" style={{ background: badge.bg, color: badge.color }}>
            {f.estado}
          </div>
        </div>
      </div>

      {errorEliminar && <div className="factura-title-error">{errorEliminar}</div>}

      {editandoNombre && (
        // El editor va DEBAJO de toda la tarjeta (a todo el ancho), no
        // metido en la columna angosta del título -- ahí no entraba
        // bien, sobre todo en celular. El input tambien fuerza fondo
        // claro y color-scheme:light (igual que los demas inputs de la
        // app) para que no salga con fondo negro nativo del sistema
        // cuando el celular/compu esta en modo oscuro.
        <div className="factura-edit-panel">
          <label className="factura-edit-label" htmlFor={`factura-nombre-${f.id}`}>
            Nombre de la factura
          </label>
          <input
            id={`factura-nombre-${f.id}`}
            autoFocus
            value={nombreEdit}
            onChange={(e) => setNombreEdit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void guardarNombre();
              if (e.key === "Escape") cancelarEdicionNombre();
            }}
            className="factura-edit-input"
          />
          {errorNombre && <div className="factura-title-error">{errorNombre}</div>}
          <div className="factura-edit-actions">
            <button
              type="button"
              className="factura-edit-cancelar"
              onClick={cancelarEdicionNombre}
              disabled={guardandoNombre}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="factura-edit-guardar"
              onClick={() => void guardarNombre()}
              disabled={guardandoNombre}
            >
              {guardandoNombre ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      )}

      {f.pdfUrl && (
        <div className="report-actions">
          <button
            type="button"
            className="report-action factura-action-primary"
            disabled={abriendo || !urlVer}
            onClick={() => {
              setAbriendo(true);
              void verArchivo(urlVer ?? "", nombreArchivoFactura(f)).finally(() =>
                setAbriendo(false)
              );
            }}
          >
            {abriendo ? "Abriendo…" : "Ver"}
          </button>
          <button
            type="button"
            className="report-action report-action-download"
            disabled={descargando || !urlVer}
            onClick={() => {
              setDescargando(true);
              void pedirUrlDescarga()
                .then((url) => descargarArchivo(url, nombreArchivoFactura(f)))
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
      )}
      {isAdmin && previaCorreo && (
        <div className="report-email-preview">
          <div className="report-email-preview-row"><span>Para</span><strong>{emailTo || "(sin correo guardado)"}</strong></div>
          <div className="report-email-preview-row"><span>Asunto</span><strong>{emailSubject}</strong></div>
          <div className="report-email-preview-row report-email-preview-mensaje"><span>Mensaje</span><p>{mensajeConArchivo}</p></div>
          <div className={`report-email-preview-chip ${archivoCompartir ? "is-ok" : "is-warn"}`}>
            {archivoCompartir ? "PDF adjunto listo" : "PDF todavía no está listo"}
          </div>
          <div className="report-email-preview-actions">
            <button type="button" className="cancelar" onClick={() => { setPreviaCorreo(false); setErrorCorreo(""); }} disabled={enviando !== null}>
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
      {isAdmin && !previaCorreo && errorCorreo && <div className="report-share-diagnostico">{errorCorreo}</div>}
    </div>
  );
}
