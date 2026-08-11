import { HttpsError } from "firebase-functions/v2/https";
import { nombreDescargaSeguro } from "./validaciones.js";

/**
 * Cliente único de R2 (compatible con S3) para todas las Cloud Functions.
 * El bucket es PRIVADO: nunca se sirve nada por URL pública directa.
 * Todo acceso (subir o leer) pasa por una URL firmada que expira.
 */

export const R2_SECRETS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];

type ModuloS3 = typeof import("@aws-sdk/client-s3");
type ClienteS3 = import("@aws-sdk/client-s3").S3Client;

let promesaModuloS3: Promise<ModuloS3> | null = null;
let promesaPresigner: Promise<typeof import("@aws-sdk/s3-request-presigner")> | null = null;
let clienteR2: ClienteS3 | null = null;

/**
 * AWS pesa varios MB y el índice de Functions importa todos sus módulos.
 * Cargarlo aquí bajo demanda evita que funciones sin R2 (por ejemplo,
 * registrar una visita) paguen ese coste de memoria y arranque.
 */
function cargarModuloS3() {
  promesaModuloS3 ??= import("@aws-sdk/client-s3");
  return promesaModuloS3;
}

function cargarPresigner() {
  promesaPresigner ??= import("@aws-sdk/s3-request-presigner");
  return promesaPresigner;
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new HttpsError("failed-precondition", `Falta configurar ${name} en las Cloud Functions.`);
  }
  return value;
}

export async function r2Client() {
  if (clienteR2) return clienteR2;
  const { S3Client } = await cargarModuloS3();
  const accountId = requireEnv("R2_ACCOUNT_ID");
  clienteR2 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
  return clienteR2;
}

export function r2Bucket() {
  return requireEnv("R2_BUCKET");
}

/** Sube un buffer directo desde el servidor (lo usa generarReporteCliente). */
export async function subirBufferR2(key: string, buffer: Buffer, contentType: string) {
  const [{ PutObjectCommand }, client] = await Promise.all([cargarModuloS3(), r2Client()]);
  await client.send(
    new PutObjectCommand({
      Bucket: r2Bucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return key;
}

/** Devuelve una URL firmada de subida (PUT) que expira — el navegador sube directo a R2. */
/** Tope duro de subida. La app comprime las fotos a 1280px antes de
 *  subirlas, así que en uso normal nadie se acerca -- pero la URL firmada
 *  se puede usar FUERA de la app, y sin límite alguien podía subir varios
 *  GB y llenar el bucket (que se paga). Los PDFs de factura son lo más
 *  pesado que pasa por acá de verdad. */
export const MAX_SUBIDA_BYTES = 32 * 1024 * 1024; // 32 MB

// Por qué 32: la factura más pesada que la app acepta son 24 MB (ver
// MAX_FACTURA_PDF_BYTES en src/utils/prepararFacturaPdf.ts), y conviene
// dejar holgura por encima en vez de quedar al filo. Las fotos llegan
// comprimidas a 1280px, así que ni se acercan. Si algún día se vuelve a
// permitir subir VIDEO sin comprimir, esto se queda corto: un video de
// celular pasa de 100 MB sin esfuerzo.

export async function firmarSubidaR2(
  key: string,
  contentType: string,
  expiresInSeconds = 600,
  /** Tamaño EXACTO del archivo que se va a subir, en bytes. Va dentro de
   *  la firma: si lo que llega a R2 pesa distinto, R2 rechaza la subida.
   *  Así el límite no es una sugerencia que el cliente pueda ignorar
   *  saltándose la interfaz -- para subir 1 GB tendría que declararlo, y
   *  crearSubidaR2 no le firmaría nada por encima del tope. */
  contentLength?: number
) {
  const [{ PutObjectCommand }, { getSignedUrl }, client] = await Promise.all([
    cargarModuloS3(),
    cargarPresigner(),
    r2Client(),
  ]);
  const command = new PutObjectCommand({
    Bucket: r2Bucket(),
    Key: key,
    ContentType: contentType,
    ...(typeof contentLength === "number" ? { ContentLength: contentLength } : {}),
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

/** Devuelve una URL firmada de lectura (GET) que expira — para mostrar imágenes/PDFs privados.
 *  Si se pasa `nombreDescarga`, el navegador la descarga directo (en vez
 *  de abrirla para verla nomás) con ese nombre de archivo — R2 manda el
 *  header Content-Disposition, así que funciona con un simple <a href>,
 *  sin depender de CORS ni de que el navegador soporte el atributo
 *  `download` para links de otro dominio. */
/**
 * Descarga un objeto de R2 y lo devuelve como Buffer.
 *
 * Lo usa la generación de reportes: las fotos ahora se suben a R2 desde el
 * navegador y al servidor solo le llega la clave, en vez de la imagen
 * entera metida en la llamada. Así se esquiva el tope de 10 MB que tiene
 * cualquier llamada a Cloud Functions, que era lo que impedía hacer
 * reportes con muchos paneles.
 */
export async function leerObjetoR2(key: string): Promise<Buffer> {
  const [{ GetObjectCommand }, client] = await Promise.all([cargarModuloS3(), r2Client()]);
  const respuesta = await client.send(
    new GetObjectCommand({ Bucket: r2Bucket(), Key: key })
  );
  const cuerpo = respuesta.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
  if (!cuerpo?.transformToByteArray) {
    throw new Error(`No se pudo leer ${key} de R2.`);
  }
  return Buffer.from(await cuerpo.transformToByteArray());
}

export async function firmarLecturaR2(key: string, expiresInSeconds = 21600, nombreDescarga?: string) {
  const [{ GetObjectCommand }, { getSignedUrl }, client] = await Promise.all([
    cargarModuloS3(),
    cargarPresigner(),
    r2Client(),
  ]);
  // El nombre viene del navegador y entra en una cabecera HTTP: se limpia
  // acá, en el único punto que la arma, para que ninguna función que se
  // añada mañana pueda saltarse el filtro. Ver nombreDescargaSeguro.
  const nombreLimpio = nombreDescarga ? nombreDescargaSeguro(nombreDescarga) : undefined;
  const command = new GetObjectCommand({
    Bucket: r2Bucket(),
    Key: key,
    // La URL ya es privada y expira. Permitir que el navegador conserve
    // SU respuesta durante el mismo plazo evita volver a transferir la
    // foto o el PDF al cambiar de pantalla o reabrir la PWA.
    ResponseCacheControl: `private, max-age=${Math.max(60, Math.min(expiresInSeconds, 604800))}, immutable`,
    ...(nombreLimpio ? { ResponseContentDisposition: `attachment; filename="${nombreLimpio}"` } : {}),
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

/** Lista una página del bucket sin exponer comandos de AWS al resto del código. */
export async function listarObjetosR2(opciones: {
  prefix?: string;
  continuationToken?: string;
}) {
  const [{ ListObjectsV2Command }, client] = await Promise.all([cargarModuloS3(), r2Client()]);
  return client.send(
    new ListObjectsV2Command({
      Bucket: r2Bucket(),
      ...(opciones.prefix ? { Prefix: opciones.prefix } : {}),
      ...(opciones.continuationToken ? { ContinuationToken: opciones.continuationToken } : {}),
    })
  );
}

/**
 * Prefijo de la "papelera": R2 no ofrece versionado de objetos (a
 * diferencia de S3) ni recuperación nativa de un archivo borrado --
 * confirmado en el dashboard el 11 de agosto de 2026, no es una
 * suposición. Sin esto, un borrado por bug o por error humano
 * (`eliminarFactura`, `limpiarArchivosHuerfanos`, reemplazar un avatar
 * por error) es DEFINITIVO al instante.
 *
 * Por qué una copia y no versionado real: es lo único disponible hoy
 * en R2 sin escribir un Worker aparte. Por qué no "no borrar nunca":
 * el pedido explícito era no duplicar todo indefinidamente. Esto solo
 * copia lo que de verdad se borra (no todo el bucket, no en cada
 * escritura) y una regla de ciclo de vida en el bucket
 * (`_papelera/ -> borrar tras 30 días`, configurada en el dashboard de
 * Cloudflare, ver docs/RECUPERACION-DE-DATOS.md) lo hace desaparecer
 * solo pasado ese plazo. El costo es una operación de copia por cada
 * borrado real -- no por cada subida -- irrelevante al volumen actual.
 *
 * `_papelera/` queda fuera de CARPETAS_PERMITIDAS a propósito: nada de
 * lo que firma URLs o valida keys para el resto de la app puede leer
 * ni escribir ahí. Solo se llega por Admin SDK, a mano, para recuperar.
 */
export const PAPELERA_PREFIJO = "_papelera/";

export function keyEnPapelera(key: string): string {
  return `${PAPELERA_PREFIJO}${key}`;
}

/** ¿Es esto una key DENTRO de la papelera? No basta con "empieza con el
 *  prefijo": una key igual al prefijo a secas ("_papelera/") no envuelve
 *  ningún archivo real. */
export function esClavePapelera(key: unknown): key is string {
  return typeof key === "string" && key.startsWith(PAPELERA_PREFIJO) && key.length > PAPELERA_PREFIJO.length;
}

/** Deshace keyEnPapelera(): de "_papelera/vista360/facturas/x.pdf" a
 *  "vista360/facturas/x.pdf". Es una simple resta del prefijo -- nunca
 *  se construye pegando algo que mande el navegador. */
export function rutaOriginalDesdeClavePapelera(clavePapelera: string): string {
  return clavePapelera.slice(PAPELERA_PREFIJO.length);
}

/** Forma exacta de la key de un reporte de cliente (ver
 *  generarReporteCliente.ts / obtenerArchivoR2Base64.ts). Vive acá
 *  también (no solo en obtenerArchivoR2Base64.ts) porque la papelera
 *  necesita la misma validación para decidir a dónde puede restaurar un
 *  archivo, y para sacarle el clienteId ya validado sin volver a
 *  parsear la ruta a mano. */
const FORMATO_REPORTE_CLIENTE =
  /^clientes\/([A-Za-z0-9_-]{1,128})\/reportes\/(\d{4}-\d{2})\/(\d{2})\/[A-Za-z0-9_-]{1,60}\.pdf$/;

/** Si la ruta es la de un reporte de cliente, devuelve sus partes ya
 *  validadas por la propia forma del regex (nada de ".." ni "/" sueltos
 *  puede colarse: el patrón exige caracteres concretos en cada tramo). */
export function datosRutaReporte(
  rutaOriginal: string
): { clienteId: string; mes: string; dia: string } | null {
  const m = FORMATO_REPORTE_CLIENTE.exec(rutaOriginal);
  if (!m) return null;
  return { clienteId: m[1], mes: m[2], dia: m[3] };
}

/**
 * Valida que una ruta ORIGINAL (la que tenía un archivo antes de que lo
 * mandaran a la papelera) sea una ruta conocida de la app -- una de las
 * carpetas normales de subida (esKeyValida) o la carpeta de reportes de
 * cliente, que usa su propio prefijo ("clientes/...") fuera de
 * CARPETAS_PERMITIDAS.
 *
 * Por qué existe además de esKeyValida: esto es lo único que decide a
 * dónde puede ir a parar una restauración. El navegador NUNCA manda la
 * ruta de destino -- la manda la propia key de la papelera (ver
 * restaurarDePapelera.ts) -- pero igual hace falta esta comprobación:
 * sin ella, alguien podría fabricar una key de papelera con OTRA ruta
 * "de fábrica" (por ejemplo, moviendo a mano un objeto dentro del
 * bucket con el CLI de R2, fuera de esta app) y la función la
 * restauraría igual. Esta es la última barrera antes de escribir.
 */
export function esRutaOriginalPermitida(rutaOriginal: string): boolean {
  if (esKeyValida(rutaOriginal)) return true;
  return datosRutaReporte(rutaOriginal) !== null;
}

/**
 * Borra un objeto de R2 "a mejor esfuerzo" — nunca lanza, solo avisa
 * en el log si falla o si ya no existía. Se usa para no dejar archivos
 * huérfanos cuando se reemplaza uno (cambiar avatar, foto de portada
 * de campaña, etc.) — cada subida genera una key nueva y única, así
 * que si no se borra la anterior, se queda ocupando espacio para
 * siempre.
 *
 * Antes de borrar, copia el objeto a `_papelera/` (best-effort: si la
 * copia falla -- por ejemplo, la key ya no existía -- se sigue con el
 * borrado igual, para no romper el comportamiento de "a mejor
 * esfuerzo" que ya dependía de esta función).
 */
export async function borrarObjetoR2(key: string) {
  const [{ DeleteObjectCommand, CopyObjectCommand }, client] = await Promise.all([
    cargarModuloS3(),
    r2Client(),
  ]);
  const bucket = r2Bucket();

  try {
    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: keyEnPapelera(key),
        CopySource: `${bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`,
      })
    );
  } catch (error) {
    console.warn(`No se pudo copiar ${key} a la papelera de R2 antes de borrar (puede que ya no exista).`, error);
  }

  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    console.warn(`No se pudo borrar ${key} de R2 (puede que ya no exista).`, error);
  }
}

/**
 * Restaura un objeto de la papelera a su ruta original: copia
 * `_papelera/{ruta}` de vuelta a `{ruta}` y comprueba con HeadObject
 * que la copia realmente quedó ahí antes de devolver éxito -- no basta
 * con que CopyObjectCommand no haya lanzado.
 *
 * Dos comprobaciones más, antes de escribir nada:
 *  - Si la ruta original YA tiene un objeto (por ejemplo, un reporte
 *    del mismo día que se volvió a generar después del borrado),
 *    restaurar por encima lo destruiría sin avisar -- se rechaza en vez
 *    de sobrescribir a ciegas.
 *  - Si la copia en la papelera ya no existe (restaurada antes, o
 *    expiró por la regla de ciclo de vida de 30 días), se avisa con
 *    claridad en vez de dejar que CopyObjectCommand falle con un error
 *    genérico de S3.
 *
 * Devuelve el tamaño del archivo restaurado (bytes), solo para el
 * registro de auditoría.
 */
export async function restaurarObjetoR2(rutaOriginal: string): Promise<number> {
  const [{ CopyObjectCommand, HeadObjectCommand }, client] = await Promise.all([cargarModuloS3(), r2Client()]);
  const bucket = r2Bucket();
  const clavePapelera = keyEnPapelera(rutaOriginal);

  const yaExiste = await client
    .send(new HeadObjectCommand({ Bucket: bucket, Key: rutaOriginal }))
    .then(() => true)
    .catch(() => false);
  if (yaExiste) {
    throw new HttpsError(
      "failed-precondition",
      "Ya existe un archivo en esa ruta -- restaurar lo sobrescribiría. No se hizo ningún cambio."
    );
  }

  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: clavePapelera }));
  } catch {
    throw new HttpsError(
      "not-found",
      "Ese archivo ya no está en la papelera (puede que ya se haya restaurado o que haya expirado)."
    );
  }

  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: rutaOriginal,
      CopySource: `${bucket}/${encodeURIComponent(clavePapelera).replace(/%2F/g, "/")}`,
    })
  );

  const verificacion = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: rutaOriginal }));
  return verificacion.ContentLength ?? 0;
}

/** Genera una key segura y única dentro de una carpeta permitida. */
const CARPETAS_PERMITIDAS = ["vista360/campanas", "vista360/avatares", "vista360/facturas"] as const;
export type CarpetaR2 = (typeof CARPETAS_PERMITIDAS)[number];

export function esCarpetaValida(folder: string): folder is CarpetaR2 {
  return (CARPETAS_PERMITIDAS as readonly string[]).includes(folder);
}

export function nuevaKey(folder: CarpetaR2, extension: string) {
  const safeExt = extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${folder}/${id}.${safeExt}`;
}

/** Valida que una key pertenezca a una de las carpetas conocidas y no intente escapar con "..". */
export function esKeyValida(key: string) {
  if (!key || key.includes("..") || key.startsWith("/")) return false;
  return CARPETAS_PERMITIDAS.some((folder) => key.startsWith(`${folder}/`));
}
