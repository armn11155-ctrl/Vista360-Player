import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { cloudFunctions } from "../config/firebase";
import { useSignedUrls } from "../hooks/useSignedUrls";
import type { Cliente, Factura, FacturaEstado } from "../types";

interface Props {
  factura: Factura;
  cliente: Cliente | null;
  isAdmin?: boolean;
}

const BADGE: Record<FacturaEstado, { bg: string; color: string }> = {
  Pagada: { bg: "rgba(34,197,94,0.15)", color: "#16A34A" },
  Aceptada: { bg: "rgba(34,197,94,0.15)", color: "#16A34A" },
  Emitida: { bg: "rgba(34,197,94,0.15)", color: "#16A34A" },
  Pendiente: { bg: "rgba(245,158,11,0.15)", color: "#D97706" },
  Vencida: { bg: "rgba(239,68,68,0.15)", color: "#DC2626" },
  Rechazada: { bg: "rgba(239,68,68,0.15)", color: "#DC2626" },
  Anulada: { bg: "rgba(107,114,128,0.12)", color: "#6B7280" },
  Borrador: { bg: "rgba(107,114,128,0.12)", color: "#6B7280" },
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
 *  mal tanto en la tarjeta como en el mensaje. */
function mensajeFactura(f: Factura, cliente: Cliente | null, url: string) {
  const nombre = nombreCliente(cliente);
  const numero = f.numero_fmt || f.serie || "tu factura";
  return [
    `Hola ${nombre}, te comparto la factura ${numero} de Vista360.`,
    "",
    `Puedes verla aquí: ${url}`,
  ].join("\n");
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
  const esKeyR2 = Boolean(f.pdfUrl) && !f.pdfUrl!.startsWith("http");
  const keysAFirmar = esKeyR2 ? [f.pdfUrl!] : [];
  const urlsFirmadas = useSignedUrls(keysAFirmar);
  const urlVer = f.pdfUrl ? (esKeyR2 ? urlsFirmadas[f.pdfUrl!] : f.pdfUrl) : undefined;

  const [urlDescarga, setUrlDescarga] = useState("");

  // ── Editar el nombre (numero_fmt) que se muestra -- el lapicito al
  // costado del badge de estado abre este editor inline. Pasa por
  // actualizarNombreFactura (Admin SDK) por el mismo motivo que
  // crearFacturaAdmin: "facturas" es de facturacion-web, un sistema
  // aparte, y sus reglas no dejan escribir desde acá directo. ──
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombreEdit, setNombreEdit] = useState("");
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const [errorNombre, setErrorNombre] = useState("");

  function abrirEdicionNombre() {
    setNombreEdit(f.numero_fmt ?? f.serie ?? "");
    setErrorNombre("");
    setEditandoNombre(true);
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

  useEffect(() => {
    if (!esKeyR2 || !f.pdfUrl || !cloudFunctions) return;
    let cancelado = false;
    const fn = httpsCallable<{ key: string; nombre: string }, { url: string }>(
      cloudFunctions,
      "firmarDescargaFactura"
    );
    fn({ key: f.pdfUrl, nombre: f.numero_fmt || "factura" })
      .then((res) => {
        if (!cancelado) setUrlDescarga(res.data.url);
      })
      .catch(() => {
        // si falla, el botón Descargar simplemente usa la misma URL de Ver
      });
    return () => {
      cancelado = true;
    };
  }, [esKeyR2, f.pdfUrl, f.numero_fmt]);

  const nombreFactura = f.numero_fmt ?? f.serie ?? "Sin número";
  const badge = BADGE[f.estado] ?? BADGE.Borrador;
  const tamano = formatoBytes(f.pdfPesoBytes);
  const fechaEmisionDate = fechaDeFactura(f.fecha_emision);
  const mensaje = urlVer ? mensajeFactura(f, cliente, urlVer) : "";
  const emailSubject = `Factura ${f.numero_fmt ?? f.serie ?? ""} - Vista360`;
  const emailTo = cliente?.email ?? "";

  return (
    <div className="report-card factura-card">
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
            <button
              type="button"
              className="factura-edit-btn"
              onClick={abrirEdicionNombre}
              aria-label="Editar nombre de la factura"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          )}
          <div className="report-ready-badge" style={{ background: badge.bg, color: badge.color }}>
            {f.estado}
          </div>
        </div>
      </div>

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

      {urlVer && (
        <div className="report-actions">
          <a className="report-action factura-action-primary" href={urlVer} target="_blank" rel="noreferrer">
            Ver
          </a>
          <a
            className="report-action report-action-download"
            href={urlDescarga || urlVer}
            download
            rel="noreferrer"
          >
            Descargar
          </a>
          {isAdmin && (
            <>
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
              <a
                className="report-action report-action-muted report-action-whatsapp"
                href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`}
                target="_blank"
                rel="noreferrer"
              >
                <img className="report-whatsapp-icon" src="/whatsapp-svgrepo-com.svg" alt="" aria-hidden="true" />
                WhatsApp
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
