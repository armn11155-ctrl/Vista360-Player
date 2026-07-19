import { useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import BackChevron from "../BackChevron";
import { useFacturas } from "../../hooks/useFacturas";
import { cloudFunctions } from "../../config/firebase";
import { subirFacturaR2 } from "../../config/r2";
import { useSignedUrls } from "../../hooks/useSignedUrls";
import { formatoBytes, prepararFacturaPdf } from "../../utils/prepararFacturaPdf";
import type { Factura, FacturaEstado } from "../../types";
import MobileSidebarButton from "../MobileSidebarButton";

interface Props {
  ruc: string | undefined;
  clienteId?: string;
  onBack: () => void;
  isAdmin?: boolean;
  onMenuClick?: () => void;
}

const FACTURACION_WEB_URL = "https://facturacion-web-abi.pages.dev";

const BADGE: Record<FacturaEstado, { bg: string; color: string }> = {
  Pagada:    { bg: "rgba(34,197,94,0.15)",  color: "#16A34A" },
  Aceptada:  { bg: "rgba(34,197,94,0.15)",  color: "#16A34A" },
  Emitida:   { bg: "rgba(8,119,255,0.15)", color: "#0877FF" },
  Pendiente: { bg: "rgba(245,158,11,0.15)", color: "#D97706" },
  Vencida:   { bg: "rgba(239,68,68,0.15)",  color: "#DC2626" },
  Rechazada: { bg: "rgba(239,68,68,0.15)",  color: "#DC2626" },
  Anulada:   { bg: "rgba(107,114,128,0.12)",color: "#6B7280" },
  Borrador:  { bg: "rgba(107,114,128,0.12)",color: "#6B7280" },
};

function fmtMonto(f: Factura): string {
  const monto = (f.total ?? 0).toLocaleString("es-PE", { minimumFractionDigits: 2 });
  return `${f.moneda === "USD" ? "US$" : "S/"} ${monto}`;
}

export default function Facturas({ ruc, clienteId, onBack, isAdmin, onMenuClick }: Props) {
  const state = useFacturas(ruc, clienteId);
  const facturas = state.status === "ready" ? state.facturas : [];
  const keysAFirmar = facturas.map((f) => f.pdfUrl).filter((v): v is string => typeof v === "string" && !v.startsWith("http"));
  const urlsFirmadas = useSignedUrls(keysAFirmar);
  const resolverUrl = (valor?: string) => (!valor ? undefined : valor.startsWith("http") ? valor : urlsFirmadas[valor]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pdfListo, setPdfListo] = useState<File | null>(null);
  const [pesoOriginal, setPesoOriginal] = useState(0);
  const [subiendo, setSubiendo] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  async function elegirPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMensaje("");
    setPdfListo(null);
    setPesoOriginal(0);
    setPreparando(true);
    try {
      const preparado = await prepararFacturaPdf(file);
      setPdfListo(preparado.file);
      setPesoOriginal(preparado.originalBytes);
      const detalle = preparado.compressed
        ? `${formatoBytes(preparado.originalBytes)} → ${formatoBytes(preparado.finalBytes)}`
        : formatoBytes(preparado.finalBytes);
      setMensaje(`PDF digital listo para enviar: ${detalle}.`);
    } catch (err) {
      setPdfListo(null);
      setPesoOriginal(0);
      setMensaje(err instanceof Error ? err.message : "No se pudo preparar la factura.");
    } finally {
      setPreparando(false);
    }
  }

  async function enviarPdf() {
    if (!pdfListo || (!ruc && !clienteId)) return;
    if (!cloudFunctions) {
      setMensaje("Firebase Functions no está configurado.");
      return;
    }
    setMensaje("");
    setSubiendo(true);
    try {
      const { key: pdfUrl } = await subirFacturaR2(pdfListo);
      // El registro se guarda con el SDK de administrador (Cloud
      // Function), no con un addDoc directo del cliente -- la
      // coleccion "facturas" es de facturacion-web (otro sistema) y
      // sus reglas de Firestore no dejan escribir desde acá, solo
      // leer. Escribir directo daba "permiso denegado".
      const crearFacturaAdmin = httpsCallable<
        { ruc?: string; clienteId?: string; numeroFmt?: string; pdfUrl: string; pdfPesoBytes: number; pdfPesoOriginalBytes: number },
        { ok: boolean; id: string }
      >(cloudFunctions, "crearFacturaAdmin");
      await crearFacturaAdmin({
        ruc: ruc || undefined,
        clienteId: clienteId || undefined,
        numeroFmt: pdfListo.name.replace(/\.pdf$/i, ""),
        pdfUrl,
        pdfPesoBytes: pdfListo.size,
        pdfPesoOriginalBytes: pesoOriginal || pdfListo.size,
      });
      setMensaje(`Factura subida (${formatoBytes(pdfListo.size)}). El cliente ya puede verla.`);
      setPdfListo(null);
      setPesoOriginal(0);
    } catch (err) {
      setMensaje(err instanceof Error ? err.message : "No se pudo subir la factura.");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="facturas-screen">
      <div className="detail-header">
        <MobileSidebarButton onClick={onMenuClick} />
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Facturas</div>
        <div style={{ width: 32 }} />
      </div>

      <div className="content-area">
        {isAdmin && (ruc || clienteId) && (
          <div className="card factura-upload-card">
            <input ref={fileRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={elegirPdf} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>Agregar PDF</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.35 }}>
                Se optimiza en versión digital antes de enviarla al cliente.
              </div>
            </div>
            <button
              type="button"
              onClick={() => !subiendo && !preparando && fileRef.current?.click()}
              disabled={subiendo || preparando}
              className="factura-upload-btn"
            >
              {preparando ? "Optimizando..." : "Agregar PDF"}
            </button>
            {pdfListo && (
              <button
                type="button"
                onClick={enviarPdf}
                disabled={subiendo || preparando}
                className="factura-upload-btn factura-upload-send"
              >
                {subiendo ? "Enviando..." : "Enviar"}
              </button>
            )}
            {mensaje && <div className="factura-upload-msg">{mensaje}</div>}
          </div>
        )}

        {!ruc && !clienteId && (
          <div className="card" style={{ background: "rgba(245,158,11,0.1)" }}>
            <div style={{ fontSize: 12.5, color: "#B45309", lineHeight: 1.5 }}>
              No encontramos un RUC registrado para tu cuenta — contáctanos para vincularlo y
              poder mostrarte tus facturas aquí.
            </div>
          </div>
        )}
        {!ruc && clienteId && (
          <div className="card" style={{ background: "rgba(8,119,255,0.08)" }}>
            <div style={{ fontSize: 12.5, color: "#0B3F8A", lineHeight: 1.5 }}>
              Aún no tienes RUC registrado — igual puedes ver aquí las facturas en PDF que te
              subamos directamente.
            </div>
          </div>
        )}

        {state.status === "loading" && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center" }}>Cargando…</div>
        )}
        {state.status === "error" && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center", color: "var(--red)" }}>
            {state.message}
          </div>
        )}
        {state.status === "ready" && (ruc || clienteId) && facturas.length === 0 && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center" }}>
            Aún no tienes facturas registradas.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {facturas.map((f) => {
            const badge = BADGE[f.estado] ?? BADGE.Borrador;
            return (
              <div
                key={f.id}
                className="card"
                style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                    {f.tipo_doc ?? "Factura"} {f.numero_fmt ?? f.serie}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {f.fecha_emision ?? "—"} · {fmtMonto(f)}
                  </div>
                  <span style={{
                    display: "inline-block", marginTop: 6, fontSize: 12, fontWeight: 700,
                    padding: "2px 8px", borderRadius: 20, background: badge.bg, color: badge.color,
                  }}>
                    {f.estado}
                  </span>
                  {f.pdfPesoBytes != null && (
                    <span style={{
                      display: "inline-block", marginTop: 6, marginLeft: 6, fontSize: 12, fontWeight: 700,
                      padding: "2px 8px", borderRadius: 20, background: "rgba(8,119,255,0.10)", color: "#0877FF",
                    }}>
                      {formatoBytes(f.pdfPesoBytes)}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  {f.pdfUrl && (
                    <a href={resolverUrl(f.pdfUrl)} target="_blank" rel="noreferrer" className="factura-link">
                      PDF
                    </a>
                  )}
                  <a href={`${FACTURACION_WEB_URL}/ver/${f.id}`} target="_blank" rel="noreferrer" className="factura-link secondary">
                    Ver
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
