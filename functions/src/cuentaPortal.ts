import { HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { esGerente, esPersonalInterno } from "./rolesInternos.js";

// Mismo idioma que el resto de functions/src: inicializa la app admin
// si todavía no existe. Normalmente esto ya lo hizo el archivo de la
// Cloud Function que importa este helper (index.ts se asegura de que
// alguno lo haga primero) -- pero este módulo puede importarse solo
// (p. ej. desde un test que ejecuta exigirCuentaActiva de verdad
// contra el emulador, en vez de solo leer el código como texto), así
// que no depende de que alguien más lo haya hecho antes.
if (getApps().length === 0) {
  initializeApp();
}

/**
 * ÚNICO lugar del proyecto que decide si, detrás de una llamada, hay
 * una cuenta de portal utilizable.
 *
 * POR QUÉ EXISTE
 *
 * Antes de esto, cada Cloud Function callable que necesitaba una
 * cuenta de portal (Cliente, Trabajador o Gerente) repetía a mano:
 *
 *     const uid = request.auth?.uid;
 *     if (!uid) throw new HttpsError("unauthenticated", ...);
 *     const snap = await db.doc(`portalUsers/${uid}`).get();
 *     if (!snap.exists || !esPersonalInterno(snap.data()?.role)) throw ...;
 *
 * en más de 50 archivos. Eso funcionaba para "¿tiene el rol correcto?"
 * pero se olvidaba siempre de una pregunta distinta: "¿esta cuenta
 * sigue viva, o un Gerente ya la archivó?". `archivar` un usuario
 * (administrarUsuarioPortal.ts) revoca su refresh token y hace que
 * Firestore Rules le corte el acceso de inmediato -- pero las Cloud
 * Functions usan el Admin SDK, que SE SALTA esas Rules. Sin este
 * archivo, un ID token todavía sin expirar (hasta ~1 hora) podía
 * seguir llamando Cloud Functions después de que su cuenta quedara
 * archivada, porque cada función comprobaba el ROL pero no el campo
 * `archived`.
 *
 * La solución no es copiar "y ahora comprueba archived también" en
 * los mismos 50 archivos -- es la misma clase de error que este
 * archivo existe para evitar. Es UN SOLO lugar que hace las cuatro
 * comprobaciones de "¿existe una cuenta usable detrás de este
 * token?", y del que dependen los ayudantes de rol (exigirGerente,
 * exigirPersonalInterno) y, a través de ellos, todas las funciones
 * callable que le hablan a un usuario del portal.
 *
 * QUÉ NO HACE, A PROPÓSITO: no comprueba ownership de un recurso
 * específico (¿este cliente es EL SUYO?, ¿este contrato le
 * pertenece?) -- eso sigue viviendo en cada función, después de
 * llamar a este helper, porque depende del recurso que esa función en
 * particular esté tocando. Este archivo solo contesta "¿la cuenta que
 * llama existe, está activa y tiene un rol reconocido?".
 *
 * QUÉ FUNCIONES *NO* DEBEN USAR ESTO: las que no representan a un
 * usuario del portal llamando desde el Player -- triggers internos
 * (onSchedule, onDocument*), o la única función onRequest del
 * proyecto (sincronizarEstadoPaneles), que se autentica con un secret
 * compartido (CRON_SYNC_SECRET), no con una sesión de portalUsers.
 * Exigirles una cuenta de portal a esas sería un error de diseño, no
 * una mejora de seguridad -- ver docs/AUDITORIA-CIBERSEGURIDAD.md,
 * sección "cierre de la ventana residual de sesión archivada".
 */

/** Roles que hoy existen en portalUsers.role (ver PortalRole en
 *  src/types/index.ts). Un documento con un rol que no es ninguno de
 *  estos tres no cuenta como una cuenta de portal válida -- ya sea
 *  porque está corrupto, a medio migrar, o es un tipo de documento
 *  que no debería estar en esta colección. */
const ROLES_VALIDOS: ReadonlySet<string> = new Set(["admin", "trabajador", "cliente"]);

/** Cuánto puede haber pasado desde que el usuario demostró su identidad
 *  (contraseña, y segundo factor si lo tiene) para que una operación
 *  CRÍTICA siga aceptándose. Cinco minutos: alcanza de sobra para
 *  escribir la contraseña y confirmar, y es poco como para que una
 *  sesión robada que lleva rato abierta sirva para algo grave. */
export const EDAD_MAXIMA_AUTENTICACION_RECIENTE_SEG = 5 * 60;

/** Normaliza a segundos epoch lo que Firestore pueda haber guardado
 *  (Timestamp, Date o número). null = no hay valor usable, que es lo
 *  correcto para "esta cuenta nunca cerró sus sesiones". */
function segundosDe(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  if (valor instanceof Date) return valor.getTime() / 1000;
  const posible = valor as { seconds?: unknown; toDate?: () => Date };
  if (typeof posible.seconds === "number") return posible.seconds;
  if (typeof posible.toDate === "function") {
    const fecha = posible.toDate();
    if (fecha instanceof Date && Number.isFinite(fecha.getTime())) return fecha.getTime() / 1000;
  }
  return null;
}

export interface CuentaPortal {
  /** uid de Firebase Auth de quien llama -- siempre el mismo que
   *  request.auth.uid, nunca uno que el cliente pueda mandar aparte. */
  uid: string;
  /** "admin" (Gerente), "trabajador" o "cliente". Ya validado contra
   *  ROLES_VALIDOS -- nunca llega vacío ni con un valor desconocido. */
  role: string;
  /** "" si la cuenta no tiene cliente asociado (personal interno). */
  clienteId: string;
  nombre: string;
  /** El documento completo, para los pocos casos que necesitan un
   *  campo que no está en las propiedades de arriba. */
  data: FirebaseFirestore.DocumentData;
}

/** Lo mínimo que hace falta de CallableRequest -- así este archivo no
 *  depende del tipo exacto de request.data de cada función. */
interface ConAuth {
  auth?: {
    uid?: string;
    /** Claims del ID token que Firebase YA verificó antes de que esta
     *  Function empiece a correr. Solo se leen claims puestos por
     *  Firebase, nunca datos del body: el body lo puede escribir
     *  cualquiera desde DevTools, el token va firmado por Google. */
    token?: { auth_time?: number };
  } | null;
}

/**
 * Exige que haya una cuenta de portal viva detrás de la llamada.
 *
 * Comprueba, en orden:
 *  1. request.auth.uid existe (hay sesión).
 *  2. portalUsers/{uid} existe (la cuenta está vinculada al portal).
 *  3. archived !== true (nadie la archivó).
 *  4. el rol es uno de los conocidos (admin/trabajador/cliente).
 *
 * No exige ningún rol en particular -- eso es lo que hacen
 * exigirGerente/exigirPersonalInterno, encima de este mismo chequeo.
 * Úsese directo cuando la función es legítima para CUALQUIER cuenta
 * de portal (p. ej. "cambiar mi propio nombre", "marcar mi reporte
 * como visto" con su propio chequeo de ownership después).
 */
export async function exigirCuentaActiva(request: ConAuth): Promise<CuentaPortal> {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const snap = await getFirestore().doc(`portalUsers/${uid}`).get();
  if (!snap.exists) {
    throw new HttpsError("permission-denied", "Tu cuenta no está vinculada al portal.");
  }

  const data = snap.data() ?? {};

  // .archived === true, no "!= true" sobre un valor leído a mano: la
  // mayoría de las fichas nunca tuvieron este campo puesto (misma
  // razón que esCuentaDePortal() en firestore.rules -- ver ese
  // archivo para el porqué de usar un default en vez de comparar
  // contra un campo que puede no existir).
  if (data.archived === true) {
    throw new HttpsError(
      "permission-denied",
      "Esta cuenta fue archivada. Contacta a un Gerente si crees que es un error."
    );
  }

  // ── SESIONES CERRADAS A PROPÓSITO POR SU DUEÑO ────────────────────
  //
  // "Cerrar todas mis sesiones" llama a revokeRefreshTokens(), pero eso
  // NO invalida por sí solo un ID token ya emitido: los ID tokens duran
  // hasta 1 hora, y onCall verifica la FIRMA del token pero no consulta
  // si fue revocado (eso sería verifyIdToken(token, true), que onCall no
  // hace). Sin esta comprobación, "expulsé al intruso" en realidad
  // significaría "lo expulso dentro de hasta una hora" -- lo contrario
  // de para qué existe ese botón.
  //
  // Solución mínima: al revocar se guarda sessionsRevokedAt, y acá se
  // compara contra auth_time (cuándo se autenticó ESTA sesión, claim que
  // pone Firebase dentro del token). Toda sesión anterior al corte queda
  // fuera de inmediato, en TODAS las Functions a la vez, porque todas
  // pasan por acá. No cuesta ni una lectura extra: el documento
  // portalUsers ya se leyó unas líneas más arriba.
  const cortadasEn = segundosDe(data.sessionsRevokedAt);
  if (cortadasEn !== null) {
    const autenticadaEn = request.auth?.token?.auth_time;
    if (typeof autenticadaEn !== "number" || autenticadaEn < cortadasEn) {
      throw new HttpsError(
        "permission-denied",
        "Se cerraron todas las sesiones de esta cuenta. Vuelve a iniciar sesión."
      );
    }
  }

  const role = String(data.role ?? "");
  if (!ROLES_VALIDOS.has(role)) {
    throw new HttpsError("permission-denied", "Tu cuenta no tiene un rol válido asignado.");
  }

  return {
    uid,
    role,
    clienteId: String(data.clienteId ?? ""),
    nombre: String(data.nombre ?? ""),
    data,
  };
}

/**
 * Igual que exigirCuentaActiva(), y además exige que sea Gerente
 * (role === "admin"). El mensaje es configurable para conservar el
 * texto específico que cada función ya le mostraba a la persona
 * (p. ej. "Solo el Gerente puede crear cuentas de trabajador.").
 */
export async function exigirGerente(
  request: ConAuth,
  mensaje = "Solo el Gerente puede hacer esto."
): Promise<CuentaPortal> {
  const cuenta = await exigirCuentaActiva(request);
  if (!esGerente(cuenta.role)) {
    throw new HttpsError("permission-denied", mensaje);
  }
  return cuenta;
}

/**
 * Igual que exigirCuentaActiva(), y además exige personal interno
 * (Gerente o Trabajador) -- nunca un cliente.
 */
export async function exigirPersonalInterno(
  request: ConAuth,
  mensaje = "Solo el equipo interno puede hacer esto."
): Promise<CuentaPortal> {
  const cuenta = await exigirCuentaActiva(request);
  if (!esPersonalInterno(cuenta.role)) {
    throw new HttpsError("permission-denied", mensaje);
  }
  return cuenta;
}

/**
 * Exige que la sesión haya demostrado su identidad HACE POCO.
 *
 * Para qué sirve: MFA y la contraseña protegen el INICIO de sesión. No
 * protegen una sesión que YA está abierta -- si alguien agarra el
 * teléfono desbloqueado con Vista360 abierto, ya está dentro. Lo único
 * que frena eso en una operación destructiva es volver a pedir la
 * contraseña justo antes de ejecutarla.
 *
 * Cómo se comprueba de verdad (y no de mentira): se lee `auth_time` del
 * ID token. Ese claim lo pone Firebase cuando el usuario se autentica, y
 * el token va firmado por Google y verificado por Firebase antes de que
 * este código corra. NO se acepta ningún campo tipo
 * `{ reauthenticated: true }` que venga en el body: eso lo puede mandar
 * cualquiera desde DevTools y no probaría absolutamente nada.
 *
 * En el navegador el flujo correcto es:
 *   1. reauthenticateWithCredential(user, EmailAuthProvider.credential(...))
 *   2. user.getIdToken(true)   <-- OBLIGATORIO: sin forzar el refresco,
 *      el SDK sigue mandando el token viejo (con el auth_time viejo) y
 *      esta comprobación seguiría fallando aunque la contraseña fuera
 *      correcta.
 *
 * Se lanza "failed-precondition" (no "permission-denied") con
 * details.requiereReautenticacion para que la interfaz sepa que debe
 * abrir el modal de contraseña en vez de mostrar "no tienes permiso".
 */
export function exigirAutenticacionReciente(
  request: ConAuth,
  mensaje = "Vuelve a escribir tu contraseña para confirmar esta acción."
): void {
  const autenticadaEn = request.auth?.token?.auth_time;
  if (typeof autenticadaEn !== "number") {
    throw new HttpsError("failed-precondition", mensaje, { requiereReautenticacion: true });
  }
  const antiguedad = Date.now() / 1000 - autenticadaEn;
  if (antiguedad > EDAD_MAXIMA_AUTENTICACION_RECIENTE_SEG) {
    throw new HttpsError("failed-precondition", mensaje, { requiereReautenticacion: true });
  }
}

/**
 * Impide que una cuenta se archive, deshabilite o elimine A SÍ MISMA.
 *
 * El riesgo concreto: alguien agarra el teléfono o la computadora con
 * Vista360 ya abierto, entra a Usuarios y archiva la cuenta del propio
 * Gerente. Resultado: el dueño queda fuera de su propia herramienta y,
 * si es el único Gerente, no queda nadie que pueda restaurarlo desde la
 * app -- habría que ir a la consola de Firebase a mano.
 *
 * Es una restricción barata y sin contrapartida real: un Gerente que de
 * verdad quiera darse de baja puede pedírselo a otro Gerente, o hacerlo
 * desde la consola de Firebase. No se pierde ninguna funcionalidad
 * legítima, y se elimina por completo una forma de quedar bloqueado.
 *
 * Va en el backend a propósito. Esconder el botón en el frontend ayuda a
 * que nadie lo haga sin querer, pero no impide nada: quien abra DevTools
 * puede llamar la Function directamente con su propio uid.
 */
export function exigirQueNoSeaUnoMismo(
  actorUid: string,
  objetivoUid: string | null | undefined,
  mensaje = "No puedes archivar ni eliminar tu propia cuenta. Pídeselo a otro Gerente."
): void {
  if (objetivoUid && objetivoUid === actorUid) {
    throw new HttpsError("permission-denied", mensaje);
  }
}
