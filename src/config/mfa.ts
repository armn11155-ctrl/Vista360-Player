import {
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
  multiFactor,
  type MultiFactorError,
  type MultiFactorResolver,
  type TotpSecret,
} from "firebase/auth";
import { auth } from "./firebase";

/**
 * Segundo factor (TOTP) para cuentas Gerente.
 *
 * NADA de TOTP se implementa aquí: no generamos el secreto, no
 * calculamos códigos, no los validamos y NO los guardamos en Firestore
 * ni los mandamos a nuestro backend. Todo eso lo hace Firebase
 * Authentication (Identity Platform). Este archivo solo conecta la
 * interfaz con el SDK oficial.
 *
 * Por qué importa: un TOTP hecho en casa se rompe de formas silenciosas
 * (relojes desfasados, secretos guardados en claro, códigos reutilizables).
 * Firebase ya resuelve eso, y además es la única fuente de verdad
 * posible -- si la validación viviera en nuestro código, un `mfaPassed =
 * true` en localStorage la saltaría entera.
 *
 * REQUISITO DE PLATAFORMA: TOTP necesita que el proyecto esté en
 * Firebase Authentication with Identity Platform y con el proveedor TOTP
 * habilitado. Si no lo está, generarSecretoTotp() falla con un error del
 * SDK; se traduce a un mensaje claro en vez de dejar un fallo críptico.
 *
 * REQUISITO DE CUENTA: Firebase exige que el email de la cuenta esté
 * VERIFICADO antes de poder enrolar un segundo factor. Ver
 * emailSinVerificar() más abajo.
 */

/** ¿Esta cuenta ya tiene un segundo factor enrolado? */
export function tieneSegundoFactor(): boolean {
  const usuario = auth?.currentUser;
  if (!usuario) return false;
  return multiFactor(usuario).enrolledFactors.length > 0;
}

/** Firebase no deja enrolar MFA si el email no está verificado. Se
 *  comprueba antes de empezar para poder explicarlo, en vez de fallar a
 *  mitad del asistente con un código de error. */
export function emailSinVerificar(): boolean {
  const usuario = auth?.currentUser;
  return Boolean(usuario && !usuario.emailVerified);
}

export interface SecretoParaEnrolar {
  /** Objeto opaco del SDK. Se pasa tal cual a confirmarEnrolamiento();
   *  no se serializa, no se guarda, no sale de esta pestaña. */
  secreto: TotpSecret;
  /** URI otpauth:// para pintar el QR. */
  uri: string;
  /** La misma clave en texto, para autenticadores que no leen QR. */
  clave: string;
}

/**
 * Paso 1 del enrolamiento: pedirle a Firebase un secreto TOTP nuevo.
 *
 * Debe llamarse DESPUÉS de reautenticar() -- Firebase exige sesión
 * reciente para tocar los factores de una cuenta, y además es lo
 * correcto: activar MFA es justo el momento en el que hay que estar
 * seguro de quién está al teclado.
 */
export async function generarSecretoTotp(nombreApp = "Vista360 Player"): Promise<SecretoParaEnrolar> {
  const usuario = auth?.currentUser;
  if (!usuario) throw new Error("No hay una sesión activa.");
  const sesion = await multiFactor(usuario).getSession();
  const secreto = await TotpMultiFactorGenerator.generateSecret(sesion);
  return {
    secreto,
    uri: secreto.generateQrCodeUrl(usuario.email ?? "", nombreApp),
    clave: secreto.secretKey,
  };
}

/**
 * Paso 2: el usuario escribe el código que muestra su autenticador y
 * Firebase lo verifica. Solo si el código es correcto queda enrolado el
 * factor: no hay ningún camino en el que "activar MFA" sea de mentira.
 */
export async function confirmarEnrolamiento(
  secreto: TotpSecret,
  codigo: string,
  etiqueta = "Autenticador"
): Promise<void> {
  const usuario = auth?.currentUser;
  if (!usuario) throw new Error("No hay una sesión activa.");
  const prueba = TotpMultiFactorGenerator.assertionForEnrollment(secreto, codigo.trim());
  await multiFactor(usuario).enroll(prueba, etiqueta);
}

/**
 * Quitar el segundo factor. Firebase exige sesión reciente, así que
 * quien llame debe haber pasado por reautenticar() antes.
 *
 * OJO: esto es para quien TIENE su autenticador y decide quitarlo. Quien
 * PERDIÓ el teléfono no puede llegar hasta aquí (no puede iniciar
 * sesión) y tiene que seguir el procedimiento de recuperación
 * documentado en docs/MFA-Y-RECUPERACION.md. No existe ningún atajo en
 * la app para saltarse el segundo factor -- si existiera, sería la
 * puerta que un atacante usaría primero.
 */
export async function desactivarSegundoFactor(): Promise<void> {
  const usuario = auth?.currentUser;
  if (!usuario) throw new Error("No hay una sesión activa.");
  const factores = multiFactor(usuario).enrolledFactors;
  if (factores.length === 0) return;
  for (const factor of factores) {
    await multiFactor(usuario).unenroll(factor);
  }
}

/** ¿El fallo del login es "falta el segundo factor"? */
export function pideSegundoFactor(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "auth/multi-factor-auth-required";
}

/** Devuelve el resolver con el que se completa un login que quedó a
 *  medias esperando el código. */
export function resolverDeSegundoFactor(error: unknown): MultiFactorResolver | null {
  if (!auth || !pideSegundoFactor(error)) return null;
  return getMultiFactorResolver(auth, error as MultiFactorError);
}

/**
 * Completa el login con el código del autenticador.
 *
 * Quien valida el código es Firebase, del lado del servidor. Si el
 * código es incorrecto esto lanza y NO hay sesión: no existe ningún
 * estado local del tipo "ya pasó el MFA" que se pueda falsificar desde
 * DevTools, porque la sesión sencillamente no llega a crearse.
 */
export async function completarLoginConCodigo(
  resolver: MultiFactorResolver,
  codigo: string
): Promise<void> {
  const factor = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  if (!factor) {
    throw new Error("Esta cuenta no tiene un autenticador configurado.");
  }
  const prueba = TotpMultiFactorGenerator.assertionForSignIn(factor.uid, codigo.trim());
  await resolver.resolveSignIn(prueba);
}
