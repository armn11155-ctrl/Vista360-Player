import { logger } from "firebase-functions";

/**
 * Registro estructurado de eventos importantes.
 *
 * Por qué existe: hasta ahora las Cloud Functions solo usaban
 * console.error/warn sueltos. Eso sirve para leer un error puntual, pero
 * deja tres agujeros que en producción se notan:
 *
 *  1. AUDITORIA. Hoy no hay forma de responder "¿quién borró esta
 *     campaña y cuándo?". El dato se pierde: el contrato ya no existe y
 *     nadie anotó quién lo pidió. Con esto queda registrado el uid, el
 *     rol, qué se tocó y el resultado.
 *
 *  2. ALERTAS. Google Cloud Logging puede avisar por correo cuando algo
 *     falla, pero necesita poder FILTRAR: "avísame si hay más de 3
 *     eventos con resultado=error en 10 minutos". Un console.error es
 *     texto plano y no se puede filtrar de forma fiable. Un registro
 *     estructurado sí: cada campo es consultable
 *     (jsonPayload.evento, jsonPayload.resultado...).
 *
 *  3. TRAZABILIDAD. Poder seguir una operación completa -- qué usuario,
 *     sobre qué cliente, con qué paneles, cuánto tardó.
 *
 * No añade ninguna dependencia (firebase-functions ya estaba) ni ningún
 * servicio externo: escribe en el Cloud Logging que el proyecto ya
 * tiene, dentro de la cuota gratuita.
 *
 * IMPORTANTE: acá NO se registran datos personales ni contenido de los
 * clientes -- solo identificadores, acciones y resultados. Los logs los
 * puede leer cualquiera con acceso al proyecto de Google Cloud, así que
 * se tratan como algo menos protegido que la base de datos.
 */

/** Acciones que vale la pena poder auditar después. Se listan como tipo
 *  cerrado a propósito: obliga a decidir conscientemente qué se audita,
 *  en vez de acabar con cien nombres distintos escritos a mano. */
export type EventoAuditable =
  | "contrato_creado"
  | "contrato_actualizado"
  | "contrato_eliminado"
  | "panel_eliminado"
  | "cliente_archivado"
  | "cliente_eliminado_definitivo"
  | "usuario_eliminado"
  | "password_restablecida"
  | "factura_eliminada"
  | "archivo_restaurado_papelera"
  | "archivos_huerfanos_borrados";

interface DatosEvento {
  /** Quién lo hizo (uid de Firebase Auth). */
  uid?: string;
  /** Su rol en ese momento -- útil para saber si actuó un Gerente o un Trabajador. */
  rol?: string;
  /** Sobre qué cliente. */
  clienteId?: string;
  /** Identificador de lo afectado (contrato, panel, usuario...). */
  objetivoId?: string;
  /** Cualquier detalle extra relevante y NO sensible. */
  [clave: string]: unknown;
}

/** Algo importante ocurrió y salió bien. */
export function auditar(evento: EventoAuditable, datos: DatosEvento = {}): void {
  logger.info(`auditoria:${evento}`, { evento, resultado: "ok", ...datos });
}

/**
 * Algo importante NO se pudo completar. Se usa `error` (no `warn`) a
 * propósito: es la severidad sobre la que conviene montar las alertas.
 */
export function auditarFallo(evento: EventoAuditable, error: unknown, datos: DatosEvento = {}): void {
  logger.error(`auditoria:${evento}`, {
    evento,
    resultado: "error",
    // Solo el mensaje, no el objeto entero: un error de Firestore puede
    // arrastrar el contenido del documento y acabaría en los logs.
    mensaje: error instanceof Error ? error.message : String(error),
    ...datos,
  });
}
