import type { Timestamp } from "firebase/firestore";

export type ContenidoTipo = "imagen" | "video";

export interface ContenidoItem {
  tipo: ContenidoTipo;
  url: string;
  /** Segundos en pantalla. Para video se usa como tope opcional; si no se
   *  define, el video se reproduce completo y avanza solo al terminar. */
  duracionSeg?: number;
  orden: number;
}

/**
 * Un documento por panel — el id del documento ES el panel_id, así el
 * player puede suscribirse directo sin necesitar queries ni índices.
 * Colección: contenidoDigital
 */
export interface ContenidoDigital {
  id: string;
  panel_id: string;
  activo: boolean;
  items: ContenidoItem[];
  updatedAt?: Timestamp;
}

/**
 * Heartbeat de cada dispositivo. Un documento por panel (id = panel_id).
 * Colección: playersStatus
 */
export interface PlayerStatus {
  id: string;
  panel_id: string;
  online: boolean;
  lastSeen: Timestamp;
  appVersion?: string;
  userAgent?: string;
}
