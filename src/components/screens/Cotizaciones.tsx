import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { cloudFunctions } from "../../config/firebase";
import { useClientesAdmin } from "../../hooks/useClientesAdmin";
import { usePanelesDisponibles } from "../../hooks/usePanelesDisponibles";
import type { Cotizacion, CotizacionEstado } from "../../types";
import BackChevron from "../BackChevron";

type Formulario = {
  nombre: string;
  clienteId: string;
  panelId: string;
  inicio: string;
  duracionMeses: number;
  monto: string;
  moneda: "PEN" | "USD";
  incluyeIgv: boolean;
  vigenciaDias: number;
  condiciones: string;
  observaciones: string;
};

const ESTADOS: CotizacionEstado[] = ["Borrador", "Enviada", "Aprobada", "Rechazada", "Vencida"];

function hoy() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

function sumarMeses(fecha: string, meses: number) {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  if (!anio || !mes || !dia) return "";
  const ultimoDia = new Date(Date.UTC(anio, mes - 1 + meses + 1, 0)).getUTCDate();
  return new Date(Date.UTC(anio, mes - 1 + meses, Math.min(dia, ultimoDia))).toISOString().slice(0, 10);
}

function fechaVisible(fecha: string) {
  if (!fecha) return "—";
  return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${fecha}T12:00:00Z`));
}

function dinero(monto: number, moneda: "PEN" | "USD") {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: moneda,
    minimumFractionDigits: 2,
  }).format(monto);
}

function esUbicacionExonerada(ciudad?: string) {
  return (ciudad ?? "").toLocaleLowerCase("es").includes("guanajuato");
}

function esCotizacionExonerada(cotizacion: Cotizacion) {
  return Boolean(cotizacion.exoneradaIgv) || esUbicacionExonerada(cotizacion.panelCiudad);
}

const inicial: Formulario = {
  nombre: "",
  clienteId: "",
  panelId: "",
  inicio: hoy(),
  duracionMeses: 3,
  monto: "",
  moneda: "PEN",
  incluyeIgv: true,
  vigenciaDias: 15,
  condiciones: "50% para iniciar y 50% antes de la publicación.",
  observaciones: "",
};

export default function Cotizaciones({ onBack }: { onBack: () => void }) {
  const clientesState = useClientesAdmin();
  const panelesState = usePanelesDisponibles(true);
  const clientes = clientesState.status === "ready" ? clientesState.clientes.filter((c) => !c.archived) : [];
  const paneles = panelesState.status === "ready" ? panelesState.paneles : [];
  const [form, setForm] = useState<Formulario>(inicial);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [seleccionada, setSeleccionada] = useState<Cotizacion | null>(null);
  const fin = useMemo(() => sumarMeses(form.inicio, form.duracionMeses), [form.inicio, form.duracionMeses]);
  const panelElegido = paneles.find((panel) => panel.id === form.panelId);
  const exoneradaIgv = esUbicacionExonerada(panelElegido?.ciudad);

  async function ejecutar<T>(data: Record<string, unknown>) {
    if (!cloudFunctions) throw new Error("Firebase Functions no está configurado.");
    const fn = httpsCallable<Record<string, unknown>, T>(cloudFunctions, "administrarCotizaciones");
    const respuesta = await fn(data);
    return respuesta.data;
  }

  async function cargar() {
    setCargando(true);
    setMensaje("");
    try {
      const respuesta = await ejecutar<{ cotizaciones: Cotizacion[] }>({ accion: "listar" });
      setCotizaciones(respuesta.cotizaciones ?? []);
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "No se pudieron cargar las cotizaciones.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
    // La función no cambia durante la vida de esta pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardar(event: React.FormEvent) {
    event.preventDefault();
    const cliente = clientes.find((c) => c.id === form.clienteId);
    const panel = paneles.find((p) => p.id === form.panelId);
    const monto = Number(form.monto);
    if (!cliente || !panel || !fin || !Number.isFinite(monto) || monto <= 0) {
      setMensaje("Completa el cliente, panel, duración y monto.");
      return;
    }
    setGuardando(true);
    setMensaje("");
    try {
      const respuesta = await ejecutar<{ ok: boolean; numero: string }>({
        accion: "crear",
        nombre: form.nombre,
        clienteId: cliente.id,
        clienteNombre: cliente.empresa,
        panelId: panel.id,
        panelNombre: panel.nombre,
        panelCiudad: panel.ciudad,
        inicio: form.inicio,
        fin,
        duracionMeses: form.duracionMeses,
        monto,
        moneda: form.moneda,
        incluyeIgv: exoneradaIgv ? false : form.incluyeIgv,
        vigenciaDias: form.vigenciaDias,
        condiciones: form.condiciones,
        observaciones: form.observaciones,
      });
      setForm({ ...inicial, inicio: hoy() });
      await cargar();
      setMensaje(`${respuesta.numero} creada correctamente.`);
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "No se pudo crear la cotización.");
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarEstado(cotizacion: Cotizacion, estado: CotizacionEstado) {
    setMensaje("");
    try {
      await ejecutar({ accion: "estado", id: cotizacion.id, estado });
      setCotizaciones((actuales) => actuales.map((item) => item.id === cotizacion.id ? { ...item, estado } : item));
      setSeleccionada((actual) => actual?.id === cotizacion.id ? { ...actual, estado } : actual);
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "No se pudo actualizar el estado.");
    }
  }

  async function eliminar(cotizacion: Cotizacion) {
    if (!window.confirm(`¿Eliminar ${cotizacion.numero}? Esta acción no se puede deshacer.`)) return;
    setMensaje("");
    try {
      await ejecutar({ accion: "eliminar", id: cotizacion.id });
      setCotizaciones((actuales) => actuales.filter((item) => item.id !== cotizacion.id));
      if (seleccionada?.id === cotizacion.id) setSeleccionada(null);
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "No se pudo eliminar la cotización.");
    }
  }

  function compartirWhatsApp(cotizacion: Cotizacion) {
    const texto = [
      "Hola, te comparto la cotización de VISTA360 para tu revisión.",
      "",
      `*VISTA360 · ${cotizacion.numero}*`,
      cotizacion.nombre,
      `Cliente: ${cotizacion.clienteNombre}`,
      `Panel: ${cotizacion.panelNombre}${cotizacion.panelCiudad ? ` · ${cotizacion.panelCiudad}` : ""}`,
      `Periodo: ${fechaVisible(cotizacion.inicio)} al ${fechaVisible(cotizacion.fin)}`,
      `Inversión: ${dinero(cotizacion.monto, cotizacion.moneda)}${esCotizacionExonerada(cotizacion) ? "" : cotizacion.incluyeIgv ? " (incluye IGV)" : " + IGV"}`,
      `Vigencia: ${cotizacion.vigenciaDias} días`,
    ].join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="quotes-screen">
      <header className="quotes-header">
        <button type="button" onClick={onBack} aria-label="Volver"><BackChevron /></button>
        <div>
          <span>Centro comercial</span>
          <h1>Cotizaciones</h1>
          <p>Crea propuestas claras y listas para presentar.</p>
        </div>
        <img src="/vista360-quote-logo.png" alt="Vista360" />
      </header>

      <main className="quotes-layout">
        <form className="quotes-form-card" onSubmit={guardar}>
          <div className="quotes-card-heading">
            <div><span>Nueva propuesta</span><h2>Datos de la cotización</h2></div>
            <b>Borrador</b>
          </div>
          <label>
            Nombre de la campaña <span className="quotes-optional-label">Opcional</span>
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej. Campaña lanzamiento 2026" maxLength={100} />
          </label>
          <div className="quotes-form-grid">
            <label>
              Cliente
              <select value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
                <option value="">Seleccionar cliente</option>
                {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.empresa}</option>)}
              </select>
            </label>
            <label>
              Panel
              <select value={form.panelId} onChange={(e) => setForm({ ...form, panelId: e.target.value })}>
                <option value="">Seleccionar panel</option>
                {paneles.map((panel) => <option key={panel.id} value={panel.id}>{panel.nombre} · {panel.ciudad}</option>)}
              </select>
            </label>
            <label>
              Inicio de campaña
              <input type="date" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} />
            </label>
            <label>
              Duración
              <select value={form.duracionMeses} onChange={(e) => setForm({ ...form, duracionMeses: Number(e.target.value) })}>
                {Array.from({ length: 24 }, (_, index) => index + 1).map((meses) => <option key={meses} value={meses}>{meses} {meses === 1 ? "mes" : "meses"}</option>)}
              </select>
            </label>
            <label>
              Moneda
              <select value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value as "PEN" | "USD" })}>
                <option value="PEN">Soles (PEN)</option>
                <option value="USD">Dólares (USD)</option>
              </select>
            </label>
            <label>
              Monto total
              <input type="number" min="0.01" step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} placeholder="0.00" />
            </label>
            <label>
              Vigencia de la oferta
              <select value={form.vigenciaDias} onChange={(e) => setForm({ ...form, vigenciaDias: Number(e.target.value) })}>
                {[7, 10, 15, 30, 45, 60].map((dias) => <option key={dias} value={dias}>{dias} días</option>)}
              </select>
            </label>
            {!exoneradaIgv && (
              <label className="quotes-check">
                <input type="checkbox" checked={form.incluyeIgv} onChange={(e) => setForm({ ...form, incluyeIgv: e.target.checked })} />
                <span>El monto incluye IGV</span>
              </label>
            )}
          </div>
          <div className="quotes-period-summary">
            <span>Periodo estimado</span>
            <strong>{fechaVisible(form.inicio)} — {fechaVisible(fin)}</strong>
          </div>
          <label>
            Condiciones de pago
            <textarea value={form.condiciones} onChange={(e) => setForm({ ...form, condiciones: e.target.value })} rows={2} maxLength={600} />
          </label>
          <label>
            Observaciones
            <textarea value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} rows={3} placeholder="Producción, instalación u otros detalles..." maxLength={800} />
          </label>
          <button className="quotes-primary-btn" type="submit" disabled={guardando}>
            {guardando ? "Creando cotización…" : "Crear cotización"}
          </button>
          {mensaje && <div className="quotes-message">{mensaje}</div>}
        </form>

        <section className="quotes-list-card">
          <div className="quotes-list-head">
            <div><span>Historial comercial</span><h2>Cotizaciones recientes</h2></div>
            <strong>{cotizaciones.length}</strong>
          </div>
          {cargando && <div className="quotes-empty">Cargando cotizaciones…</div>}
          {!cargando && cotizaciones.length === 0 && (
            <div className="quotes-empty"><b>Aún no hay cotizaciones</b><span>La primera propuesta que crees aparecerá aquí.</span></div>
          )}
          <div className="quotes-list">
            {cotizaciones.map((cotizacion) => (
              <article key={cotizacion.id} className="quote-row">
                <button type="button" className="quote-row-main" onClick={() => setSeleccionada(cotizacion)}>
                  <span className="quote-row-number">{cotizacion.numero}</span>
                  <strong>{cotizacion.nombre}</strong>
                  <small>{cotizacion.clienteNombre} · {cotizacion.panelNombre}</small>
                  <b>{dinero(cotizacion.monto, cotizacion.moneda)}</b>
                </button>
                <div className="quote-row-actions">
                  <select value={cotizacion.estado} onChange={(e) => void cambiarEstado(cotizacion, e.target.value as CotizacionEstado)} aria-label={`Estado de ${cotizacion.numero}`}>
                    {ESTADOS.map((estado) => <option key={estado}>{estado}</option>)}
                  </select>
                  <button type="button" onClick={() => compartirWhatsApp(cotizacion)} aria-label="Compartir por WhatsApp">WA</button>
                  <button type="button" className="danger" onClick={() => void eliminar(cotizacion)} aria-label="Eliminar cotización">×</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      {seleccionada && (
        <div className="quote-preview-backdrop" onClick={() => setSeleccionada(null)}>
          <div className="quote-preview-shell" onClick={(e) => e.stopPropagation()}>
            <div className="quote-preview-actions">
              <button type="button" onClick={() => setSeleccionada(null)}>Cerrar</button>
              <button type="button" onClick={() => compartirWhatsApp(seleccionada)}>WhatsApp</button>
              <button type="button" className="primary" onClick={() => window.print()}>Imprimir / Guardar PDF</button>
            </div>
            <article className="quote-document">
              <header className="quote-letterhead">
                <div className="quote-letterhead-brand">
                  <i aria-hidden="true" />
                  <span className="quote-letterhead-wordmark">VISTA360</span>
                </div>
                <div className="quote-letterhead-meta"><strong>ALAN MARTÍNEZ</strong><span>DIRECTOR GENERAL</span></div>
              </header>
              <div className="quote-document-title">
                <span>Cotización comercial · {seleccionada.numero}</span>
                <h2>{seleccionada.nombre}</h2>
                <p>Una campaña diseñada para generar presencia, alcance y resultados.</p>
              </div>
              <div className="quote-document-table" role="table" aria-label="Detalle de la cotización">
                <div className="quote-document-table-head" role="row"><strong>DETALLE DE LA PROPUESTA</strong><span>{seleccionada.estado}</span></div>
                <div className="quote-document-table-row" role="row"><span>CLIENTE</span><strong>{seleccionada.clienteNombre}</strong></div>
                <div className="quote-document-table-row" role="row"><span>PANEL</span><strong>{seleccionada.panelNombre}</strong></div>
                <div className="quote-document-table-row" role="row"><span>UBICACIÓN</span><strong>{seleccionada.panelCiudad || "Ubicación seleccionada"}</strong></div>
                <div className="quote-document-table-row" role="row"><span>PERIODO</span><strong>{fechaVisible(seleccionada.inicio)} al {fechaVisible(seleccionada.fin)}</strong></div>
                <div className="quote-document-table-row" role="row"><span>DURACIÓN</span><strong>{seleccionada.duracionMeses} {seleccionada.duracionMeses === 1 ? "mes" : "meses"}</strong></div>
                <div className="quote-document-table-row quote-document-investment" role="row">
                  <span>INVERSIÓN</span>
                  <div><strong>{dinero(seleccionada.monto, seleccionada.moneda)}</strong>{!esCotizacionExonerada(seleccionada) && <small>{seleccionada.incluyeIgv ? "Incluye IGV" : "No incluye IGV"}</small>}</div>
                </div>
              </div>
              <div className="quote-document-copy">
                <span>Importante</span>
                <p>Esta cotización tiene una vigencia de {seleccionada.vigenciaDias} días desde su emisión. Cualquier consulta, escríbenos al 947 957 971.</p>
              </div>
              {seleccionada.condiciones && <div className="quote-document-copy"><span>Condiciones de pago</span><p>{seleccionada.condiciones}</p></div>}
              {seleccionada.observaciones && <div className="quote-document-copy"><span>Consideraciones</span><p>{seleccionada.observaciones}</p></div>}
              <footer>
                <div><strong>947 957 971 · ochomillas.101@hotmail.com</strong><span>PUBLICIDAD EXTERIOR · PANELES PREMIUM</span></div>
                <div><span>MÁS QUE VISIBILIDAD. PRESENCIA.</span></div>
              </footer>
            </article>
          </div>
        </div>
      )}
    </div>
  );
}
