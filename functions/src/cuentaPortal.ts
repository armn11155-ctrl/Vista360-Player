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
  auth?: { uid?: string } | null;
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
