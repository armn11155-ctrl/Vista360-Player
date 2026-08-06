import { HttpsError } from "firebase-functions/v2/https";
import { esIdValido } from "./validaciones.js";

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

// La comprobación en sí vive en validaciones.ts, que no importa nada:
// las pruebas del frontend la EJECUTAN, y si este archivo la tuviera,
// el `tsc --noEmit` del despliegue de Cloudflare seguiría el import
// hasta firebase-functions, que allí no está instalado.
export { esIdValido } from "./validaciones.js";

/**
 * Devuelve el id ya validado, o lanza el error que corresponde.
 *
 * Se usa `invalid-argument` a propósito, NO `permission-denied`: un id
 * mal formado es un error de la petición, no un intento de acceso a algo
 * ajeno. Contestar "no tienes permiso" a un id inventado le confirmaría
 * al atacante que el recurso existe.
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
 * factura sin campaña asociada. Devolver "" en esos casos es correcto; lo
 * que no se puede permitir es que llegue algo con forma de ruta.
 */
export function idOpcional(id: unknown, nombreDelCampo: string): string {
  if (id === undefined || id === null || id === "") return "";
  return exigirId(id, nombreDelCampo);
}
