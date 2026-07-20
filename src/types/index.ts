import type { Timestamp } from "firebase/firestore";

/**
 * Estos tipos reflejan los mismos modelos que ya existen en el repo
 * Vista360 (src/types/index.ts) — el portal lee los datos reales que
 * el dueño ya administra ahí, no duplica nada.
 */

export type ClienteEstado =
  | "Activo"
  | "Por vencer"
  | "Inactivo"
  | "En contacto"
  | "Propuesta enviada"
  | "Ganado"
  | "Frío"
  | "Perdido";

export interface Cliente {
  id: string;
  empresa: string;
  ruc?: string;
  documento?: string;
  documentoIdentidad?: string;
  numDoc?: string;
  numeroDocumento?: string;
  cliente_doc?: string;
  contacto?: string;
  celular?: string;
  email?: string;
  sector?: string;
  ciudad?: string;
  estado: ClienteEstado;
  ejecutivo?: string;
  avatarKey?: string;
  avatarUrl?: string;
  archived?: boolean;
  archivedAt?: Timestamp | null;
  createdAt?: Timestamp | null;
}

export interface FotoCampania {
  url: string;
  /** Key de la miniatura WebP nítida generada en el navegador al subir. */
  thumbKey?: string;
  fecha: string;
}

export interface Contrato {
  id: string;
  panel_id: string;
  cliente_id: string;
  cara?: "A" | "B" | null;
  inicio: string; // "YYYY-MM-DD"
  fin: string; // "YYYY-MM-DD"
  monto: number;
  pagado: boolean;
  fotos_campania?: FotoCampania[];
  imagenCampaniaUrl?: string;
  imagenCampaniaFecha?: string;
  /** Encuesta de satisfacción — el cliente califica su campaña una vez
   *  finalizada (1-5 estrellas), opcional. */
  calificacion?: number;
  calificacionComentario?: string;
  calificacionFecha?: string;
  deleted?: boolean;
  createdAt?: Timestamp | null;
  /** true despues de mandar el push de "tu campaña está por vencer" --
   *  evita mandarlo de nuevo cada día mientras siga dentro del rango. */
  notificadoVencimiento?: boolean;
}

export type PanelEstado = "Disponible" | "Ocupado" | "Mantenimiento" | "Libre";

export interface Panel {
  id: string;
  nombre: string;
  tipo: string;
  ciudad: string;
  estado: PanelEstado;
  lat?: number;
  lng?: number;
  direccion?: string;
  icono?: string;
  /** Estimado de personas/vehículos que pasan por este panel en un
   *  día promedio (dato aproximado que carga el admin, no un sensor
   *  real) -- se usa para calcular el "Impacto aproximado" de cada
   *  campaña en ese panel. */
  impactoDiario?: number;
}

/**
 * Vincula una cuenta de Firebase Auth (uid) con un cliente de Vista360.
 * Lo crea el dueño con scripts/crear-acceso-cliente.mjs — el cliente
 * nunca se auto-registra. Colección: portalUsers (doc id = uid).
 */
export type PortalRole = "admin" | "cliente";

export interface PortalUser {
  uid: string;
  role: PortalRole;
  /** Solo presente para role:"cliente". Un admin no tiene uno fijo —
   *  elige a cuál cliente ver desde el selector dentro de la app. */
  clienteId?: string;
  email: string;
  nombre?: string;
  avatarKey?: string;
  avatarUrl?: string;
  archived?: boolean;
  createdAt?: Timestamp | null;
  /** Tokens de notificaciones push (uno por dispositivo/navegador en
   *  el que activó notificaciones) -- puede haber más de uno si entra
   *  desde el celular y la compu. */
  fcmTokens?: string[];
}

/** Estado derivado en el cliente a partir de inicio/fin — no se guarda. */
export type CampanaEstado = "Activa" | "Programada" | "Finalizada";

export function estadoCampana(contrato: Contrato, hoy: Date = new Date()): CampanaEstado {
  const inicio = new Date(contrato.inicio);
  const fin = new Date(contrato.fin);
  if (hoy < inicio) return "Programada";
  if (hoy > fin) return "Finalizada";
  return "Activa";
}

/** Solicitud de nueva campaña enviada por el cliente — el dueño la revisa
 *  y la convierte en Contrato real desde Vista360, igual que solicitudesWeb.
 *  Colección: solicitudesCampana */
export interface SolicitudCampana {
  id: string;
  cliente_id: string;
  nombre: string;
  objetivo?: string;
  presupuesto?: number;
  ciudades: string[];
  comentarios?: string;
  imagenReferencialUrl?: string;
  imagenReferencialFecha?: string;
  estado: "Pendiente" | "Revisada" | "Convertida" | "Rechazada";
  estadoActualizadoEn?: Timestamp | null;
  /** Comprobante de pago (ej. captura de Yape/Plin) que el cliente
   *  adjunta después de enviar la solicitud, para agilizar el trámite. */
  comprobantePagoUrl?: string;
  comprobantePagoFecha?: string;
  /** null = sin revisar, true = confirmado, false = rechazado */
  pagoConfirmado?: boolean | null;
  createdAt?: Timestamp | null;
}

/** Informe mensual generado automáticamente (ver Vista360 →
 *  scripts/informe-mensual-clientes.mjs). Colección: informesCliente. */
/** Comprobante electrónico emitido desde facturacion-web (SUNAT/8 Millas).
 *  Vinculado al cliente por RUC (cliente_doc), no por cliente_id — viene
 *  de un sistema distinto que comparte el mismo Firebase. Colección: facturas. */
export type FacturaEstado =
  | "Borrador" | "Pendiente" | "Emitida" | "Aceptada"
  | "Rechazada" | "Anulada" | "Vencida" | "Pagada";

export interface Factura {
  id: string;
  serie?: string;
  numero?: number;
  numero_fmt?: string;
  tipo_doc?: string;
  estado: FacturaEstado;
  fecha_emision?: string;
  fecha_vencimiento?: string;
  cliente_doc?: string;
  /** Solo presente en facturas subidas desde Vista360 Player para un
   *  cliente sin RUC registrado en facturacion-web (el sistema externo
   *  identifica todo por RUC via cliente_doc, este campo es el puente
   *  para poder subir/ver facturas sin depender de tener RUC). */
  cliente_id?: string;
  total?: number;
  moneda?: string;
  pagado?: boolean;
  pdfUrl?: string;
  pdfPesoBytes?: number;
}

export interface InformeCliente {
  id: string;
  cliente_id: string;
  mes: string; // "2026-06"
  dia?: string; // "17" -- opcional (reportes viejos no lo tienen); permite mas de un reporte por mes
  mesLabel: string; // "17 Jun 2026" (o "Junio 2026" si es un reporte viejo sin dia)
  /** Un solo PDF por reporte (ya no hay version HD aparte). */
  url: string;
  /** Compatibilidad con el nombre de campo anterior; mismo archivo que `url`. */
  urlDigital?: string;
  /** Misma key que `url`, pero firmada para forzar la descarga
   *  (Content-Disposition: attachment) en vez de solo mostrarla. */
  urlDescarga?: string;
  digitalBytes?: number;
  storage?: "firebase" | "r2";
  /** Key real en R2 — se usa para re-firmar la URL cuando la
   *  guardada en `url`/`urlDigital` ya expiró (dura 6h). */
  r2Keys?: { digital: string };
  numCampanas?: number;
  numEvidencias?: number;
  createdAt?: Timestamp | string | null;
}
