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
  contacto?: string;
  celular?: string;
  email?: string;
  sector?: string;
  ciudad?: string;
  estado: ClienteEstado;
  ejecutivo?: string;
  createdAt?: Timestamp | null;
}

export interface FotoCampania {
  url: string;
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
  deleted?: boolean;
  createdAt?: Timestamp | null;
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
  createdAt?: Timestamp | null;
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
  estado: "Pendiente" | "Revisada" | "Convertida" | "Rechazada";
  createdAt?: Timestamp | null;
}

/** Informe mensual generado automáticamente (ver Vista360 →
 *  scripts/informe-mensual-clientes.mjs). Colección: informesCliente. */
export interface InformeCliente {
  id: string;
  cliente_id: string;
  mes: string; // "2026-06"
  mesLabel: string; // "Junio 2026"
  url: string;
  numCampanas: number;
  numEvidencias: number;
  createdAt?: Timestamp | null;
}
