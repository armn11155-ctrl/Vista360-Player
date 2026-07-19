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

const FACTURACION_WEB_URL = "https://facturacion-web-abi.pages.dev";

const BADGE: Record<FacturaEstado, { bg: string; color: string }> = {
  Pagada: { bg: "rgba(34,197,94,0.15)", color: "#16A34A" },
  Aceptada: { bg: "rgba(34,197,94,0.15)", color: "#16A34A" },
  Emitida: { bg: "rgba(245,158,11,0.15)", color: "#B45309" },
  Pendiente: { bg: "rgba(245,158,11,0.15)", color: "#D97706" },
  Vencida: { bg: "rgba(239,68,68,0.15)", color: "#DC2626" },
  Rechazada: { bg: "rgba(239,68,68,0.15)", color: "#DC2626" },
  Anulada: { bg: "rgba(107,114,128,0.12)", color: "#6B7280" },
  Borrador: { bg: "rgba(107,114,128,0.12)", color: "#6B7280" },
};

function nombreCliente(cliente: Cliente | null) {
  return cliente?.empresa || cliente?.contacto || "cliente";
}

function fmtMonto(f: Factura): string {
  const monto = (f.total ?? 0).toLocaleString("es-PE", { minimumFractionDigits: 2 });
  return `${f.moneda === "USD" ? "US$" : "S/"} ${monto}`;
}

function formatoBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mensajeFactura(f: Factura, cliente: Cliente | null, url: string) {
  const nombre = nombreCliente(cliente);
  const numero = f.numero_fmt || f.serie || "tu factura";
  return [
    `Hola ${nombre}, te comparto la factura ${numero} de Vista360.`,
    "",
    `Monto: ${fmtMonto(f)}`,
    "",
    `Puedes verla aquí: ${url}`,
  ].join("\n");
}

/**
 * Tarjeta de una factura -- mismo diseño (layout, tamaños, tipografía)
 * que ReportCard, para que se sienta parte de la misma app, pero con
 * su propio color (ámbar en vez de azul) e ícono de recibo en vez de
 * PDF de reporte, para que a simple vista se note que es otra cosa.
 * Igual que los reportes, deja enviar por WhatsApp y Correo.
 */
export function FacturaCard({ factura: f, cliente, isAdmin }: Props) {
  const esKeyR2 = Boolean(f.pdfUrl) && !f.pdfUrl!.startsWith("http");
  const keysAFirmar = esKeyR2 ? [f.pdfUrl!] : [];
  const urlsFirmadas = useSignedUrls(keysAFirmar);
  const urlVer = f.pdfUrl ? (esKeyR2 ? urlsFirmadas[f.pdfUrl!] : f.pdfUrl) : undefined;

  const [urlDescarga, setUrlDescarga] = useState("");

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

  const badge = BADGE[f.estado] ?? BADGE.Borrador;
  const tamano = formatoBytes(f.pdfPesoBytes);
  const mensaje = urlVer ? mensajeFactura(f, cliente, urlVer) : "";
  const emailSubject = `Factura ${f.numero_fmt ?? f.serie ?? ""} - Vista360`;
  const emailTo = cliente?.email ?? "";

  return (
    <div className="report-card factura-card">
      <div className="report-card-main">
        <div className="report-pdf-icon factura-pdf-icon" aria-hidden="true">
          <svg width="46" height="58" viewBox="0 0 46 58" fill="none">
            <path
              d="M6 1.5h34v49.5l-4.5-3.5-4.5 3.5-4.5-3.5-4.5 3.5-4.5-3.5-4.5 3.5-4.5-3.5-2.5 1.9V1.5Z"
              fill="#5A3600"
              stroke="#F5A524"
            />
            <path d="M12 14h22M12 21h22M12 28h16" stroke="#FBD98A" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="30" cy="37" r="6.5" fill="#3A2400" stroke="#FBD98A" strokeWidth="1.4" />
            <path d="M27.5 37h5M30 34.5v5" stroke="#FBD98A" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span>FACTURA</span>
        </div>
        <div className="report-card-copy">
          <div className="report-kicker">Factura</div>
          <div className="report-title">{f.numero_fmt ?? f.serie ?? "Sin número"}</div>
          <div className="report-meta report-meta-generated">{f.fecha_emision ?? "—"} · {fmtMonto(f)}</div>
          {tamano && <div className="report-meta">Tamaño: {tamano}</div>}
        </div>
        <div className="report-ready-badge" style={{ background: badge.bg, color: badge.color }}>
          {f.estado}
        </div>
      </div>

      {(urlVer || true) && (
        <div className="report-actions">
          {urlVer && (
            <a className="report-action factura-action-primary" href={urlVer} target="_blank" rel="noreferrer">
              Ver
            </a>
          )}
          {urlVer && (
            <a
              className="report-action report-action-download"
              href={urlDescarga || urlVer}
              download
              rel="noreferrer"
            >
              Descargar
            </a>
          )}
          <a
            className="report-action report-action-outline factura-action-outline"
            href={`${FACTURACION_WEB_URL}/ver/${f.id}`}
            target="_blank"
            rel="noreferrer"
            style={{ gridColumn: "1 / -1" }}
          >
            Ver en Facturación
          </a>
          {isAdmin && urlVer && (
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
      )}
    </div>
  );
}
