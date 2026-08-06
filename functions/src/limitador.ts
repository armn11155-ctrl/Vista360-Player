import { HttpsError } from "firebase-functions/v2/https";

/**
 * Límite de ritmo por usuario para las funciones que puede llamar un cliente.
 *
 * QUÉ PROBLEMA RESUELVE
 *
 * Ninguna función tenía límite de peticiones. Las que puede llamar un
 * cliente autenticado (registrarVisita, registrarAcceso, guardarTokenPush,
 * actualizarAvatarPropio, marcarReporteVisto) escriben todas en el
 * documento del propio usuario, así que NO crean documentos nuevos ni
 * filtran datos ajenos: el techo de almacenamiento no se mueve.
 *
 * Pero cada llamada es una escritura facturable. La cuota gratuita son
 * 20.000 escrituras al día. Un cliente con sesión abierta que llame a
 * `registrarVisita` en un bucle desde la consola del navegador agota esa
 * cuota en unos segundos, y a partir de ahí la aplicación empieza a
 * cobrar para todos, no solo para él. No es robo de datos: es un ataque
 * de coste, y era el único que estaba abierto a un usuario normal.
 *
 * POR QUÉ EN MEMORIA Y NO EN FIRESTORE
 *
 * Un contador en Firestore sería exacto y compartido entre instancias,
 * pero costaría una lectura y una escritura por llamada: el remedio
 * gastaría más cuota que la enfermedad. En memoria cuesta cero.
 *
 * LO QUE ESTE LIMITADOR **NO** HACE (a propósito, y conviene saberlo)
 *
 * - Es por instancia, no global. Con `maxInstances: 20` el techo real es
 *   20 x el límite. Sigue siendo un techo, que es lo que no había.
 * - Se reinicia en cada arranque en frío. Un atacante paciente puede
 *   esperar a que la instancia muera; para entonces ya no está haciendo
 *   miles de llamadas por segundo, que es lo que se quería cortar.
 *
 * La alternativa exacta está descrita arriba; se cambia el día que el
 * coste de esa lectura extra compense. Hoy no compensa.
 */

/** Ventana deslizante de un minuto. */
const VENTANA_MS = 60_000;

/**
 * Tope de usuarios distintos que se recuerdan a la vez.
 *
 * Sin esto el Map crece con cada uid que llame y nunca se vacía: el
 * limitador sería la fuga de memoria que viene a evitar.
 */
const MAX_USUARIOS_RECORDADOS = 5_000;

interface Marca {
  desde: number;
  cuenta: number;
}

const marcas = new Map<string, Marca>();

function limpiarViejas(ahora: number) {
  for (const [clave, marca] of marcas) {
    if (ahora - marca.desde > VENTANA_MS) marcas.delete(clave);
  }
}

/**
 * Cuenta una llamada y lanza si el usuario pasa del límite por minuto.
 *
 * @param uid quien llama
 * @param operacion nombre de la función, para que cada una tenga su cupo
 * @param maxPorMinuto llamadas permitidas por minuto
 */
export function exigirRitmo(uid: string, operacion: string, maxPorMinuto: number): void {
  const ahora = Date.now();
  const clave = `${operacion}:${uid}`;
  const marca = marcas.get(clave);

  if (!marca || ahora - marca.desde > VENTANA_MS) {
    if (marcas.size >= MAX_USUARIOS_RECORDADOS) {
      limpiarViejas(ahora);
      // Si aun así no cabe, se olvida la entrada más antigua: preferimos
      // dejar pasar una llamada de más antes que quedarnos sin memoria.
      if (marcas.size >= MAX_USUARIOS_RECORDADOS) {
        const primera = marcas.keys().next();
        if (!primera.done) marcas.delete(primera.value);
      }
    }
    marcas.set(clave, { desde: ahora, cuenta: 1 });
    return;
  }

  marca.cuenta += 1;
  if (marca.cuenta > maxPorMinuto) {
    // `resource-exhausted` es el código correcto: la petición es válida y
    // el usuario tiene permiso, simplemente va demasiado rápido.
    throw new HttpsError(
      "resource-exhausted",
      "Demasiadas peticiones seguidas. Espera un momento y vuelve a intentarlo.",
    );
  }
}

/**
 * Solo para las pruebas: cuántos usuarios se están recordando.
 *
 * Se expone porque sin esto no hay forma de comprobar que el tope de
 * memoria existe -- una prueba que solo mire que no revienta pasa igual
 * aunque el Map crezca sin límite, que es justo el fallo que se teme.
 */
export function tamanoRecordado(): number {
  return marcas.size;
}

/** Solo para las pruebas: vacía el estado entre casos. */
export function reiniciarLimitador(): void {
  marcas.clear();
}
