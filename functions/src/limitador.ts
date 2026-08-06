import { HttpsError } from "firebase-functions/v2/https";
import { superaElRitmo } from "./validaciones.js";

/**
 * Límite de ritmo por usuario para las funciones que puede llamar un cliente.
 *
 * QUÉ PROBLEMA RESUELVE
 *
 * Ninguna función tenía límite de peticiones. Las que puede llamar un
 * cliente autenticado escriben todas en el documento del propio usuario,
 * así que NO crean documentos nuevos ni filtran datos ajenos. Pero cada
 * llamada es una escritura facturable, y la cuota gratuita son 20.000 al
 * día: un bucle desde la consola del navegador la agota en segundos y la
 * aplicación empieza a cobrar para todos, no solo para quien atacó.
 *
 * La cuenta vive en `validaciones.ts` (sin importaciones, para que las
 * pruebas del frontend puedan ejecutarla sin arrastrar firebase-functions
 * al despliegue de Cloudflare). Acá solo se traduce a un error.
 *
 * POR QUÉ EN MEMORIA Y NO EN FIRESTORE
 *
 * Un contador compartido sería exacto, pero costaría una lectura y una
 * escritura por llamada: el remedio gastaría más cuota que la enfermedad.
 *
 * LO QUE NO HACE, a propósito: es por instancia (con `maxInstances: 20` el
 * techo real es 20 x el cupo) y se reinicia en cada arranque en frío.
 * Sigue siendo un techo, que es lo que no había.
 */
export function exigirRitmo(uid: string, operacion: string, maxPorMinuto: number): void {
  if (superaElRitmo(uid, operacion, maxPorMinuto)) {
    // `resource-exhausted` es el código correcto: la petición es válida y
    // el usuario tiene permiso, simplemente va demasiado rápido. Contestar
    // "no tienes permiso" lo mandaría a soporte por algo que se arregla
    // esperando diez segundos.
    throw new HttpsError(
      "resource-exhausted",
      "Demasiadas peticiones seguidas. Espera un momento y vuelve a intentarlo.",
    );
  }
}

export { reiniciarLimitador } from "./validaciones.js";
