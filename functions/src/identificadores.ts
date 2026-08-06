import { HttpsError } from "firebase-functions/v2/https";

/**
 * Validación de identificadores que llegan del navegador.
 *
 * POR QUÉ HACE FALTA. Muchas funciones construyen rutas pegando un id
 * que manda el navegador:
 *
 *     db.doc(`clientes/${clienteId}`)
 *     `clientes/${clienteId}/reportes/${mes}/${dia}`   // key de R2
 *
 * Si ese id no se valida, deja de ser un id y pasa a ser parte de la
 * RUTA. Dos consecuencias distintas:
 *
 *  - EN FIRESTORE: `clienteId = "abc/subcoleccion/otro"` convierte
 *    `clientes/{id}` en `clientes/abc/subcoleccion/otro`, que es una ruta
 *    de documento perfectamente válida y apunta a otro sitio.
 *
 *  - EN R2: `clienteId = "../../vista360/facturas"` escapa de la carpeta
 *    de reportes. Ahí no hay reglas de seguridad que frenen nada: el
 *    Admin SDK y las credenciales de R2 pueden con todo.
 *
 * Hoy las funciones afectadas exigen ser Gerente, así que el riesgo real
 * es bajo. Pero eso es una defensa prestada: el día que una de ellas se
 * abra a un Trabajador --como ya pasó con las reglas de Firestore-- el
 * agujero se abre solo. Validar el id no depende de quién llame.
 *
 * QUÉ SE ACEPTA. Lo que Firestore genera y lo que usa este proyecto:
 * letras, números, guiones y guiones bajos. Nada de barras, puntos
 * seguidos ni cadenas vacías.
 */

/** Firestore genera ids de 20 caracteres; se deja margen de sobra. */
const LARGO_MAXIMO = 128;
const FORMATO = /^[A-Za-z0-9_-]{1,128}$/;

export function esIdValido(id: unknown): id is string {
  if (typeof id !== "string") return false;
  if (id.length === 0 || id.length > LARGO_MAXIMO) return false;
  // Nombres reservados de Firestore.
  if (id === "." || id === "..") return false;
  return FORMATO.test(id);
}

/**
 * Devuelve el id ya validado, o lanza el error que corresponde.
 *
 * Se usa `invalid-argument` a propósito, NO `permission-denied`: un id
 * mal formado es un error de la petición, no un intento de acceso a algo
 * ajeno. Contestar "no tienes permiso" a un id inventado le confirmaría
 * a quien pregunta que ese recurso existe cuando escribe uno correcto.
 */
export function exigirId(id: unknown, nombreDelCampo: string): string {
  if (!esIdValido(id)) {
    throw new HttpsError("invalid-argument", `${nombreDelCampo} no es un identificador válido.`);
  }
  return id;
}

/**
 * Igual que exigirId, pero acepta que NO venga.
 *
 * Hay campos opcionales de verdad: una cotización sin panel elegido, una
 * factura sin campaña asociada. Devolver "" en esos casos es correcto;
 * lo que no se puede permitir es que llegue algo con forma de ruta.
 */
export function idOpcional(id: unknown, nombreDelCampo: string): string {
  if (id === undefined || id === null || id === "") return "";
  return exigirId(id, nombreDelCampo);
}
