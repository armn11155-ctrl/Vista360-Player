import { useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import BackChevron from "../BackChevron";
import { useFacturas } from "../../hooks/useFacturas";
import { cloudFunctions } from "../../config/firebase";
import { subirFacturaR2 } from "../../config/r2";
import { formatoBytes, prepararFacturaPdf } from "../../utils/prepararFacturaPdf";
import type { Cliente } from "../../types";
import MobileSidebarButton from "../MobileSidebarButton";
import { FacturaCard } from "../FacturaCard";

interface Props {
  ruc: string | undefined;
  clienteId?: string;
  cliente?: Cliente | null;
  onBack: () => void;
  isAdmin?: boolean;
  onMenuClick?: () => void;
}

export default function Facturas({ ruc, clienteId, cliente, onBack, isAdmin, onMenuClick }: Props) {
  const state = useFacturas(ruc, clienteId);
  const facturas = state.status === "ready" ? state.facturas : [];
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

        <div className="reports-list" style={{ marginTop: 12 }}>
          {facturas.map((f) => (
            <FacturaCard key={f.id} factura={f} cliente={cliente ?? null} isAdmin={isAdmin} />
          ))}
        </div>
      </div>
    </div>
  );
}
