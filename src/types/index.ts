import { hoyEnPeru, soloFecha } from "../utils/fechas";
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

/** RUC/documento del cliente -- no siempre viene en el mismo campo:
 *  segun de donde haya salido el cliente (creado a mano en el portal,
 *  importado del sistema viejo, etc) puede quedar guardado como
 *  "ruc", "documento", "documentoIdentidad", "numDoc",
 *  "numeroDocumento" o "cliente_doc". Se prueban todos en orden y se
 *  usa el primero que tenga algo -- MISMA logica que ya usaba
 *  Perfil.tsx (y administrarClienteAdmin.ts del lado del servidor)
 *  para no perder de vista clientes viejos con el dato en otro
 *  campo. Facturas.tsx tenia esto roto: solo miraba "ruc" a secas, asi
 *  que un cliente con el RUC guardado en otro campo se quedaba sin
 *  "ruc" -> la pantalla de Facturas ni siquiera intentaba buscar sus
 *  facturas por RUC, solo por cliente_id (y esa consulta puede fallar
 *  con "Missing or insufficient permissions" si las reglas de
 *  Firestore de esa coleccion solo estan pensadas para el camino por
 *  RUC). */
export function rucCliente(cliente: Cliente | null | undefined): string {
  return (
    cliente?.ruc ||
    cliente?.documento ||
    cliente?.documentoIdentidad ||
    cliente?.numDoc ||
    cliente?.numeroDocumento ||
    cliente?.cliente_doc ||
    ""
  );
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
  /** Paneles adicionales de esta misma campaña, cuando el cliente
   *  contrata 2+ paneles en un solo contrato (ej. "quiero cotizar estos
   *  dos paneles juntos"). panel_id se sigue guardando como el primero
   *  de la lista, por compatibilidad con todo el código que todavía lee
   *  panel_id solo -- panel_ids es la lista completa (incluye al
   *  primero). Usa panelesDeContrato() en vez de leer estos campos
   *  directo, para que ambos casos (1 panel viejo, 2+ paneles nuevo)
   *  funcionen igual. */
  panel_ids?: string[];
  cliente_id: string;
  /** Nombre de la campaña, puesto a mano por el admin al crearla (ej.
   *  "Campaña Verano 2026") -- opcional, campañas viejas no lo tienen
   *  y siguen mostrando los nombres de sus paneles como antes. */
  nombre?: string;
  cara?: "A" | "B" | null;
  inicio: string; // "YYYY-MM-DD"
  fin: string; // "YYYY-MM-DD"
  monto: number;
  pagado: boolean;
  fotos_campania?: FotoCampania[];
  imagenCampaniaUrl?: string;
  imagenCampaniaFecha?: string;
  deleted?: boolean;
  createdAt?: Timestamp | null;
  /** true despues de mandar el push de "tu campaña está por vencer" --
   *  evita mandarlo de nuevo cada día mientras siga dentro del rango. */
  notificadoVencimiento?: boolean;
}

export type PanelEstado = "Disponible" | "Ocupado" | "Mantenimiento" | "Libre";

/**
 * Cómo se comercializa un soporte -- cambia la regla de negocio, no solo
 * la etiqueta:
 *
 *  - "led": pantalla digital. Rota varios anuncios en bucle, así que
 *    puede tener VARIOS clientes al aire a la vez.
 *  - "lona": lona, mural o valla impresa. Es una sola pieza física
 *    instalada: mientras esté puesta la de un cliente, no puede haber
 *    otra. Es EXCLUSIVA por rango de fechas.
 *
 * Por eso no alcanza con el campo `tipo` (texto libre, "ej. Valla,
 * LED"): de él no se puede derivar una regla con confianza, porque
 * depende de cómo lo haya escrito quien cargó el panel.
 */
export type PanelModalidad = "led" | "lona";

export interface Panel {
  id: string;
  nombre: string;
  tipo: string;
  /** Ver PanelModalidad. Opcional porque los paneles cargados antes de
   *  este campo no lo tienen -- usar siempre modalidadDePanel(), que
   *  cae a una deducción por `tipo` en ese caso. */
  modalidad?: PanelModalidad;
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
  /** Solo en soportes exclusivos (lona/mural) que están ocupados: fecha
   *  desde la que quedan libres. La calcula la tarea diaria
   *  sincronizarEstadoPaneles y se publica en el panel a propósito --
   *  sale de contratos de OTROS clientes, que el cliente no puede leer
   *  por reglas de Firestore, y así ve cuándo pedirlo sin exponer de
   *  quién es la campaña que lo ocupa. */
  libreDesde?: string | null;
}

export type CotizacionEstado = "Borrador" | "Enviada" | "Aprobada" | "Rechazada" | "Vencida";

/** Propuesta comercial creada exclusivamente por el administrador. */
export interface Cotizacion {
  id: string;
  numero: string;
  nombre: string;
  clienteId: string;
  clienteNombre: string;
  panelId: string;
  panelNombre: string;
  panelCiudad?: string;
  inicio: string;
  fin: string;
  duracionMeses: number;
  monto: number;
  moneda: "PEN" | "USD";
  incluyeIgv: boolean;
  /** true cuando la ubicación está exonerada; en ese caso la propuesta
   *  no muestra ninguna mención al IGV. */
  exoneradaIgv?: boolean;
  vigenciaDias: number;
  condiciones?: string;
  observaciones?: string;
  estado: CotizacionEstado;
  createdAt?: Timestamp | null;
  createdAtMs?: number;
}

/** Palabras que delatan un soporte impreso cuando `modalidad` no está
 *  cargada todavía (paneles creados antes de que existiera el campo). */
const PISTAS_LONA = ["lona", "mural", "banner", "impres", "valla", "gigantograf", "panel tradicional"];

/**
 * Modalidad efectiva de un panel. Si el admin ya la eligió a mano, manda
 * esa. Si no, se deduce del texto libre de `tipo` -- imperfecto a
 * propósito, pero mejor que asumir: al deducir "lona" el sistema es MÁS
 * restrictivo (exige exclusividad), así que el peor caso de una
 * deducción equivocada es que avise de un cruce que en realidad se
 * podía permitir, y no que se venda dos veces una lona.
 */
export function modalidadDePanel(panel: Pick<Panel, "modalidad" | "tipo">): PanelModalidad {
  if (panel.modalidad === "led" || panel.modalidad === "lona") return panel.modalidad;
  const t = (panel.tipo ?? "").toLowerCase();
  if (t.includes("led") || t.includes("digital") || t.includes("pantalla")) return "led";
  if (PISTAS_LONA.some((pista) => t.includes(pista))) return "lona";
  // Sin pistas: se asume LED, que es el comportamiento que ya tenía el
  // sistema hasta ahora (varios anunciantes permitidos). Cambiarlo a
  // "lona" por defecto bloquearía campañas que hoy se crean sin problema.
  return "led";
}

/** true si el soporte admite un solo cliente a la vez (lona/mural). */
export function esPanelExclusivo(panel: Pick<Panel, "modalidad" | "tipo">): boolean {
  return modalidadDePanel(panel) === "lona";
}

/**
 * Vincula una cuenta de Firebase Auth (uid) con un cliente de Vista360.
 * Lo crea el dueño con scripts/crear-acceso-cliente.mjs — el cliente
 * nunca se auto-registra. Colección: portalUsers (doc id = uid).
 */
// "admin" sigue siendo el valor interno para lo que ahora se llama
// "Gerente" en la interfaz -- no se renombró a nivel de datos para
// no tocar las +25 Cloud Functions que ya comparaban role==="admin".
// "trabajador" es el nuevo rol interno con permisos acotados (ver
// functions/src/rolesInternos.ts).
export type PortalRole = "admin" | "trabajador" | "cliente";

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

export function estadoCampana(contrato: Contrato, hoy: string = hoyEnPeru()): CampanaEstado {
  // Comparación como TEXTO ("2026-07-31"), no como Date -- ver el
  // comentario de src/utils/fechas.ts. Con `new Date(contrato.fin)` la
  // campaña se marcaba Finalizada desde la tarde del día ANTERIOR a su
  // último día, porque ese formato se interpreta como medianoche UTC.
  const inicio = soloFecha(contrato.inicio);
  const fin = soloFecha(contrato.fin);
  const dia = soloFecha(hoy);
  if (dia < inicio) return "Programada";
  if (dia > fin) return "Finalizada";
  return "Activa";
}

/** Lista completa de paneles de una campaña -- si el contrato tiene
 *  panel_ids (campaña multi-panel) usa esa lista, si no, cae al panel_id
 *  único de siempre. Usar SIEMPRE esto en vez de leer panel_id/panel_ids
 *  directo, así cualquier pantalla nueva soporta multi-panel gratis. */
export function panelesDeContrato(contrato: Pick<Contrato, "panel_id" | "panel_ids">): string[] {
  if (contrato.panel_ids && contrato.panel_ids.length > 0) return contrato.panel_ids;
  return contrato.panel_id ? [contrato.panel_id] : [];
}

/** Solicitud de nueva campaña enviada por el cliente — el dueño la revisa
 *  y la convierte en Contrato real desde Vista360, igual que solicitudesWeb.
 *  Colección: solicitudesCampana */
export interface PersonaInterna {
  uid: string;
  email: string;
  nombre: string;
  avatarUrl?: string;
  role: "Gerente" | "Trabajador";
  archived: boolean;
}

export interface SolicitudAccion {
  id: string;
  tipo: "eliminarContrato" | "eliminarClienteDefinitivo" | "eliminarUsuario" | "crearPanel" | "actualizarPanel";
  solicitanteNombre: string;
  estado: "Pendiente" | "Aprobada" | "Rechazada";
  resumen: string;
  motivoRechazo?: string | null;
  createdAt: string | null;
  resueltoEn?: string | null;
}

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
  /** Campo legacy: un intento anterior de "Eliminar" marcaba esto en
   *  vez de borrar de verdad (deleteDoc chocaba con las reglas de
   *  Firestore de esta colección). Ahora eliminarSolicitud llama a la
   *  Cloud Function eliminarSolicitudCampana, que sí borra el
   *  documento -- este campo solo se sigue filtrando en la UI por si
   *  quedó algún registro viejo marcado así. */
  oculta?: boolean;
  ocultaEn?: Timestamp | null;
  /** Fecha desde la que el cliente querría empezar (o renovar) --
   *  nunca antes de hoy, el formulario ya lo bloquea con min= en el
   *  input de fecha. */
  fechaInicioDeseada?: string;
  /** Se calcula a partir de fechaInicioDeseada + mesesDeseados. Se sigue
   *  guardando (en vez de solo los meses) para no romper las solicitudes
   *  viejas ni la pantalla del admin, que ya la muestra. */
  fechaFinDeseada?: string | null;
  /** Duración que pidió el cliente, en meses. Reemplaza al calendario de
   *  "fecha de fin": es un dato que el cliente sí sabe de entrada y que
   *  se puede cotizar, y encaja con el mínimo de 3 meses. */
  mesesDeseados?: number;
  /** Panel puntual sobre el que se pide (cuando la solicitud sale del
   *  mapa de Cobertura). Con esto el admin sabe exactamente de qué
   *  soporte se trata, sin deducirlo del texto de los comentarios. */
  panelSolicitadoId?: string;
  panelSolicitadoNombre?: string;
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
  /** Nombre de la campaña a la que pertenece este reporte (si se
   *  generó con una campaña que tiene nombre puesto a mano). */
  contratoNombre?: string;
  /** true si el cliente ya abrió/descargó este reporte -- se marca
   *  desde ReportCard.tsx (ver marcarReporteVisto.ts). El admin lo usa
   *  para saber si el cliente ya revisó su reporte o no. */
  vistoPorCliente?: boolean;
  vistoEn?: string | null;
  /** Id de la campaña (contrato) a la que pertenece este reporte --
   *  permite filtrar la lista de reportes por campaña individual (ver
   *  DetalleCampana.tsx) en vez de mostrar siempre todos los reportes
   *  del cliente juntos. */
  contratoId?: string;
  /** Ids de los paneles de la campaña que tuvieron fotos en ESTE
   *  reporte -- solo se llena en campañas de 2+ paneles generadas con
   *  el flujo por panel. Usado en MisCampanas.tsx para la barra de
   *  estado del mes (saber si falta subir algún panel). */
  panelesIncluidos?: string[];
}
