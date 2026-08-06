/**
 * Validaciones puras: SIN NINGUNA IMPORTACIÓN.
 *
 * POR QUÉ ESTE ARCHIVO EXISTE SEPARADO
 *
 * Las pruebas viven en `src/` (frontend) pero necesitan EJECUTAR estas
 * comprobaciones, no leerlas como texto -- una prueba que solo mira el
 * código fuente pasa igual aunque el patrón acepte barras.
 *
 * El problema es que Cloudflare Pages solo instala las dependencias de la
 * raíz: `functions/node_modules` no existe durante el despliegue. Si estas
 * funciones importaran `firebase-functions`, el `tsc --noEmit` del
 * frontend seguiría el import desde la prueba y fallaría el despliegue
 * entero -- que es exactamente lo que pasó.
 *
 * Así que acá va lo que se puede probar de verdad, sin depender de nada.
 * Los adaptadores que lanzan HttpsError (identificadores.ts, limitador.ts)
 * son envoltorios de tres líneas encima de esto.
 *
 * La prueba `validaciones.ts NO puede importar nada` vigila esta regla.
 */

// ---------------------------------------------------------------------
// Identificadores
// ---------------------------------------------------------------------

/** Firestore genera ids de 20 caracteres; se deja margen de sobra. */
export const LARGO_MAXIMO = 128;

const FORMATO = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Un id válido no puede contener nada que navegue por una ruta.
 *
 * Todo id que llega del cliente termina dentro de una ruta de documento
 * de Firestore (`db.doc(\`invitacionesPortal/${id}\`)`) o de una clave de
 * objeto de R2 (`clientes/${id}/reportes/...`). Una barra redirige la
 * operación a otro sitio; un `../` sale del prefijo del cliente.
 */
export function esIdValido(id: unknown): id is string {
  if (typeof id !== "string") return false;
  if (id.length === 0 || id.length > LARGO_MAXIMO) return false;
  // Nombres reservados de Firestore (redundante con FORMATO, que ya
  // rechaza el punto; se deja como cinturón y tirantes).
  if (id === "." || id === "..") return false;
  return FORMATO.test(id);
}

// ---------------------------------------------------------------------
// Ritmo de peticiones
// ---------------------------------------------------------------------

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
 * Cuenta una llamada y dice si el usuario se pasó del cupo.
 *
 * @param uid quien llama
 * @param operacion nombre de la función, para que cada una tenga su cupo
 * @param maxPorMinuto llamadas permitidas por minuto
 * @returns true si HAY QUE CORTAR
 */
export function superaElRitmo(uid: string, operacion: string, maxPorMinuto: number): boolean {
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
    return false;
  }

  marca.cuenta += 1;
  return marca.cuenta > maxPorMinuto;
}

/** Solo para las pruebas: cuántos usuarios se están recordando. */
export function tamanoRecordado(): number {
  return marcas.size;
}

/** Solo para las pruebas: vacía el estado entre casos. */
export function reiniciarLimitador(): void {
  marcas.clear();
}

// ---------------------------------------------------------------------
// Nombres de archivo que van a una cabecera HTTP
// ---------------------------------------------------------------------

/** Tope de largo del nombre descargado. */
const LARGO_NOMBRE = 120;

/**
 * Limpia un nombre de archivo antes de meterlo en Content-Disposition.
 *
 * El nombre lo elige el navegador y termina dentro de una cabecera HTTP:
 *
 *     attachment; filename="<aquí>"
 *
 * Unas comillas cierran el campo antes de tiempo y un salto de línea
 * abre una cabecera nueva. Hoy ese valor va firmado dentro de una URL de
 * R2, así que manipularlo rompe la firma -- pero eso es una defensa
 * prestada del SDK de AWS, no propia: el día que este nombre se use en
 * una respuesta que sirvamos nosotros, la inyección funciona sola.
 *
 * Se quedan solo letras, números, espacios, guiones y puntos.
 */
export function nombreDescargaSeguro(nombre: unknown, porDefecto = "archivo"): string {
  if (typeof nombre !== "string") return porDefecto;
  const limpio = nombre
    .replace(/[\r\n]/g, " ")
    .replace(/[^\p{L}\p{N} .()-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LARGO_NOMBRE);
  return limpio || porDefecto;
}
