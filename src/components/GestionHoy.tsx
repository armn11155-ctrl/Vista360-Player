import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useOcupacion } from "../hooks/useOcupacion";
import { cloudFunctions } from "../config/firebase";
import type { Cotizacion } from "../types";

interface Props {
  solicitudesPendientes: number;
  onOpenSolicitudes?: () => void;
  onOpenOcupacion?: () => void;
  onOpenCotizaciones?: () => void;
}

/** Las señales ya calculadas por Ocupación se convierten en próximos pasos. */
export default function GestionHoy({ solicitudesPendientes, onOpenSolicitudes, onOpenOcupacion, onOpenCotizaciones }: Props) {
  const ocupacion = useOcupacion();
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[] | null>(null);
  const puedeCotizar = Boolean(onOpenCotizaciones);
  useEffect(() => {
    if (!cloudFunctions || !puedeCotizar) return;
    let cancelado = false;
    const listar = httpsCallable<{ accion: string }, { cotizaciones: Cotizacion[] }>(cloudFunctions, "administrarCotizaciones");
    void listar({ accion: "listar" }).then(({ data }) => {
      if (!cancelado) setCotizaciones(data.cotizaciones ?? []);
    }).catch(() => { if (!cancelado) setCotizaciones(null); });
    return () => { cancelado = true; };
  }, [puedeCotizar]);
  const recargar = "recargar" in ocupacion ? ocupacion.recargar : undefined;
  const datos = ocupacion.status === "ready" ? ocupacion.datos : null;
  const vencidas = datos?.cobranza.vencidas ?? 0;
  const porVencer = datos?.porVencer.length ?? 0;
  const libres = datos?.totales.libres ?? 0;
  const cotizacionesPorEnviar = cotizaciones?.filter((c) => c.estado === "Borrador").length ?? 0;
  const cotizacionesEnSeguimiento = cotizaciones?.filter((c) => c.estado === "Enviada").length ?? 0;
  const pendientes = solicitudesPendientes + vencidas + porVencer + cotizacionesPorEnviar + cotizacionesEnSeguimiento;

  return (
    <section className="gestion-hoy" aria-label="Trabajo de hoy">
      <div className="gestion-hoy-head">
        <div>
          <span className="gestion-hoy-kicker">TU OPERACIÓN</span>
          <h2>Trabajo de hoy</h2>
          <p>{datos ? (pendientes > 0 ? `${pendientes} asuntos para revisar` : "Todo al día. Revisa oportunidades de venta.") : "Tus prioridades, reunidas en un lugar."}</p>
        </div>
        {datos && <button type="button" className="gestion-hoy-refresh" onClick={recargar}>Actualizar</button>}
      </div>

      {ocupacion.status === "loading" && <div className="gestion-hoy-loading" role="status">Preparando prioridades…</div>}
      {ocupacion.status === "error" && (
        <div className="gestion-hoy-error" role="status">
          No se pudieron cargar las prioridades. <button type="button" onClick={recargar}>Reintentar</button>
        </div>
      )}

      <div className="gestion-hoy-grid">
        {solicitudesPendientes > 0 && (
          <button type="button" className="gestion-hoy-item is-urgent" onClick={onOpenSolicitudes}>
            <span className="gestion-hoy-item-number">{solicitudesPendientes}</span>
            <span><strong>{solicitudesPendientes === 1 ? "Solicitud pendiente" : "Solicitudes pendientes"}</strong><small>Revisa las campañas solicitadas</small></span>
            <b>Revisar ›</b>
          </button>
        )}
        {datos && vencidas > 0 && (
          <button type="button" className="gestion-hoy-item is-urgent" onClick={onOpenOcupacion}>
            <span className="gestion-hoy-item-number">{vencidas}</span>
            <span><strong>{vencidas === 1 ? "Factura vencida" : "Facturas vencidas"}</strong><small>Abre la lista pendiente de cobro</small></span>
            <b>Ver cobros ›</b>
          </button>
        )}
        {datos && porVencer > 0 && (
          <button type="button" className="gestion-hoy-item" onClick={onOpenOcupacion}>
            <span className="gestion-hoy-item-number">{porVencer}</span>
            <span><strong>{porVencer === 1 ? "Campaña por vencer" : "Campañas por vencer"}</strong><small>Contacta antes de perder la renovación</small></span>
            <b>Ver fechas ›</b>
          </button>
        )}
        {datos && libres > 0 && (
          <button type="button" className="gestion-hoy-item is-opportunity" onClick={onOpenOcupacion}>
            <span className="gestion-hoy-item-number">{libres}</span>
            <span><strong>{libres === 1 ? "Panel libre" : "Paneles libres"}</strong><small>Espacios listos para ofrecer</small></span>
            <b>Ver inventario ›</b>
          </button>
        )}
        {cotizacionesPorEnviar > 0 && (
          <button type="button" className="gestion-hoy-item" onClick={onOpenCotizaciones}>
            <span className="gestion-hoy-item-number">{cotizacionesPorEnviar}</span>
            <span><strong>{cotizacionesPorEnviar === 1 ? "Propuesta por enviar" : "Propuestas por enviar"}</strong><small>Termina y comparte la cotización</small></span>
            <b>Ver propuestas ›</b>
          </button>
        )}
        {cotizacionesEnSeguimiento > 0 && (
          <button type="button" className="gestion-hoy-item" onClick={onOpenCotizaciones}>
            <span className="gestion-hoy-item-number">{cotizacionesEnSeguimiento}</span>
            <span><strong>{cotizacionesEnSeguimiento === 1 ? "Cotización en seguimiento" : "Cotizaciones en seguimiento"}</strong><small>Confirma la respuesta del cliente</small></span>
            <b>Ver cotizaciones ›</b>
          </button>
        )}
        {datos && pendientes === 0 && libres === 0 && (
          <div className="gestion-hoy-empty">No hay asuntos pendientes en solicitudes, cobros ni renovaciones.</div>
        )}
      </div>
    </section>
  );
}
