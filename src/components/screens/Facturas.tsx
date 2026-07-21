import { useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useFacturas } from "../../hooks/useFacturas";
import { cloudFunctions } from "../../config/firebase";
import { subirFacturaR2 } from "../../config/r2";
import { formatoBytes, prepararFacturaPdf } from "../../utils/prepararFacturaPdf";
import type { Cliente } from "../../types";
import MobileSidebarButton from "../MobileSidebarButton";
import { FacturaCard } from "../FacturaCard";

const NOMBRES_MES_FACTURAS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Rango fijo 2026-2080 en orden ascendente, mismo criterio que el
// selector de Reportes.tsx.
const ANIOS_FILTRO_FACTURAS = Array.from({ length: 2080 - 2026 + 1 }, (_, i) => String(2026 + i));

/** fecha_emision no tiene un formato único garantizado -- las facturas
 *  subidas desde Vista360 Player usan ISO (YYYY-MM-DD), pero las que
 *  vienen del sistema externo facturacion-web podrían venir en
 *  DD/MM/YYYY (formato común de facturación en Perú). Se intentan los
 *  dos; si no calza ninguno, no se puede confirmar el año/mes real --
 *  esa factura se sigue viendo con los dos selectores en "Todos", pero
 *  se oculta apenas se filtra por un año o mes específico. */
function anioMesDeFactura(fecha?: string): { anio: string; mes: string } | null {
  if (!fecha) return null;
  const iso = fecha.match(/^(\d{4})-(\d{2})/);
  if (iso) return { anio: iso[1], mes: iso[2] };
  const ddmmyyyy = fecha.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) return { anio: ddmmyyyy[3], mes: ddmmyyyy[2].padStart(2, "0") };
  return null;
}

interface Props {
  ruc: string | undefined;
  clienteId?: string;
  cliente?: Cliente | null;
  onBack: () => void;
  isAdmin?: boolean;
  onMenuClick?: () => void;
}

export default function Facturas({ ruc, clienteId, cliente, isAdmin, onMenuClick }: Props) {
  const state = useFacturas(ruc, clienteId);
  const facturas = state.status === "ready" ? state.facturas : [];
  const [filtroAnio, setFiltroAnio] = useState("");
  const [filtroMes, setFiltroMes] = useState("");
  const facturasFiltradas = facturas.filter((f) => {
    if (!filtroAnio && !filtroMes) return true; // "Todos" en los dos -- no se filtra nada
    const partes = anioMesDeFactura(f.fecha_emision);
    if (!partes) return false; // fecha en un formato no reconocido -- no se puede confirmar que calce
    if (filtroAnio && partes.anio !== filtroAnio) return false;
    if (filtroMes && partes.mes !== filtroMes) return false;
    return true;
  });
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
      <div className="evidencias-header reports-header facturas-header">
        <div className="ev-logo-row">
          <div className="mobile-header-title-group">
            <MobileSidebarButton onClick={onMenuClick} />
            <div className="reports-header-title">Facturas</div>
          </div>
        </div>
      </div>

      <div className="reports-screen-body facturas-screen-body">
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
                {subiendo ? "Agregando..." : "Agregar"}
              </button>
            )}
            {mensaje && <div className="factura-upload-msg">{mensaje}</div>}
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
          <div className="report-empty-state">
            <div className="report-empty-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0877FF" strokeWidth="2">
                <path d="M6 3h9l3 3v15H6z" />
                <path d="M9 9h6M9 13h6M9 17h3" />
              </svg>
            </div>
            <div className="report-empty-title">Aún no hay facturas registradas</div>
            <div className="report-empty-sub">La primera factura aparecerá aquí después de que el admin la suba.</div>
          </div>
        )}

        {facturas.length > 0 && (
          <div className="reports-filter-bar" style={{ marginTop: 12 }}>
            <select
              className="reports-filter-select"
              value={filtroAnio}
              onChange={(e) => setFiltroAnio(e.target.value)}
              aria-label="Filtrar por año"
            >
              <option value="">Todos los años</option>
              {ANIOS_FILTRO_FACTURAS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <select
              className="reports-filter-select"
              value={filtroMes}
              onChange={(e) => setFiltroMes(e.target.value)}
              aria-label="Filtrar por mes"
            >
              <option value="">Todos los meses</option>
              {NOMBRES_MES_FACTURAS.map((nombre, i) => (
                <option key={nombre} value={String(i + 1).padStart(2, "0")}>{nombre}</option>
              ))}
            </select>
          </div>
        )}

        {facturas.length > 0 && facturasFiltradas.length === 0 && (
          <div className="report-empty-state">
            <div className="report-empty-title">Sin facturas en ese período</div>
            <div className="report-empty-sub">Prueba con otro año o mes, o vuelve a "Todos" para ver la lista completa.</div>
          </div>
        )}

        <div className="reports-list" style={{ marginTop: 12 }}>
          {facturasFiltradas.map((f) => (
            <FacturaCard key={f.id} factura={f} cliente={cliente ?? null} isAdmin={isAdmin} />
          ))}
        </div>
      </div>
    </div>
  );
}
