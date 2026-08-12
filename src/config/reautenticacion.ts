import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, cloudFunctions, logout } from "./firebase";

/**
 * Reautenticación reciente para acciones críticas.
 *
 * Lo importante de este archivo es lo que NO hace: no decide nada. No
 * existe aquí ninguna bandera tipo `reautenticado = true` que el backend
 * se crea. Lo único que hacemos es pasarle la contraseña a Firebase y
 * pedir un token nuevo; la prueba de que la reautenticación ocurrió va
 * dentro del ID token (claim `auth_time`), firmada por Google, y la
 * comprueba el backend en exigirAutenticacionReciente(). Si alguien
 * borra este archivo entero desde DevTools, las operaciones críticas
 * simplemente fallan: no se saltan.
 */

/** Vuelve a pedirle a Firebase que valide la contraseña de la sesión
 *  actual y refresca el ID token para que lleve el `auth_time` nuevo.
 *
 *  El getIdToken(true) NO es opcional: sin forzar el refresco, el SDK
 *  sigue mandando el token que ya tenía en caché (con el auth_time
 *  viejo) y el backend rechazaría la operación aunque la contraseña
 *  fuera correcta. */
export async function reautenticar(contrasena: string): Promise<void> {
  const usuario = auth?.currentUser;
  if (!usuario?.email) {
    throw new Error("No hay una sesión activa que reautenticar.");
  }
  await reauthenticateWithCredential(
    usuario,
    EmailAuthProvider.credential(usuario.email, contrasena)
  );
  await usuario.getIdToken(true);
}

/** ¿Este error del backend significa "vuelve a escribir tu contraseña"?
 *
 *  El backend lo señala con details.requiereReautenticacion, no con el
 *  texto del mensaje (que puede cambiar o traducirse). */
export function pideReautenticacion(error: unknown): boolean {
  const detalles = (error as { details?: { requiereReautenticacion?: unknown } } | null)?.details;
  return detalles?.requiereReautenticacion === true;
}

/**
 * Cierra todas las sesiones de la propia cuenta.
 *
 * Después de que el backend revoque, la sesión de este navegador también
 * queda muerta -- así que se cierra explícitamente aquí. Si no lo
 * hiciéramos, la pantalla se quedaría abierta pero cada acción empezaría
 * a fallar con permission-denied, que es la peor combinación posible:
 * parece que sigues dentro y en realidad no.
 */
export async function cerrarTodasMisSesiones(): Promise<void> {
  if (!cloudFunctions) throw new Error("Firebase no está configurado.");
  const fn = httpsCallable<Record<string, never>, { ok: boolean }>(
    cloudFunctions,
    "cerrarMisSesiones"
  );
  await fn({});
  await logout();
}

/**
 * Ejecuta una operación y, si el backend contesta "necesito que
 * demuestres quién eres", pide la contraseña y reintenta UNA vez.
 *
 * Existe para no repetir este mismo try/catch en cada pantalla que tenga
 * una acción crítica (mismo criterio que exigirCuentaActiva() en el
 * backend: una sola implementación, no una copia por archivo).
 *
 * Devuelve null si la persona canceló el diálogo de contraseña. Si la
 * contraseña es incorrecta, reautenticar() lanza y el error sube a quien
 * llamó, que ya sabe cómo mostrarlo.
 */
export async function conReautenticacion<T>(
  ejecutar: () => Promise<T>,
  pedirContrasena: () => Promise<string | null>
): Promise<T | null> {
  try {
    return await ejecutar();
  } catch (err) {
    if (!pideReautenticacion(err)) throw err;
    const contrasena = await pedirContrasena();
    if (!contrasena) return null;
    await reautenticar(contrasena);
    return await ejecutar();
  }
}
