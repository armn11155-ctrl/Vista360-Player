import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * Cliente único de R2 (compatible con S3) para todas las Cloud Functions.
 * El bucket es PRIVADO: nunca se sirve nada por URL pública directa.
 * Todo acceso (subir o leer) pasa por una URL firmada que expira.
 */

export const R2_SECRETS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new HttpsError("failed-precondition", `Falta configurar ${name} en las Cloud Functions.`);
  }
  return value;
}

export function r2Client() {
  const accountId = requireEnv("R2_ACCOUNT_ID");
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

export function r2Bucket() {
  return requireEnv("R2_BUCKET");
}

/** Sube un buffer directo desde el servidor (lo usa generarReporteCliente). */
export async function subirBufferR2(key: string, buffer: Buffer, contentType: string) {
  await r2Client().send(
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
export async function firmarSubidaR2(key: string, contentType: string, expiresInSeconds = 600) {
  const command = new PutObjectCommand({
    Bucket: r2Bucket(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2Client(), command, { expiresIn: expiresInSeconds });
}

/** Devuelve una URL firmada de lectura (GET) que expira — para mostrar imágenes/PDFs privados. */
export async function firmarLecturaR2(key: string, expiresInSeconds = 21600) {
  const command = new GetObjectCommand({ Bucket: r2Bucket(), Key: key });
  return getSignedUrl(r2Client(), command, { expiresIn: expiresInSeconds });
}

/**
 * Borra un objeto de R2 "a mejor esfuerzo" — nunca lanza, solo avisa
 * en el log si falla o si ya no existía. Se usa para no dejar archivos
 * huérfanos cuando se reemplaza uno (cambiar avatar, foto de portada
 * de campaña, etc.) — cada subida genera una key nueva y única, así
 * que si no se borra la anterior, se queda ocupando espacio para
 * siempre.
 */
export async function borrarObjetoR2(key: string) {
  try {
    await r2Client().send(new DeleteObjectCommand({ Bucket: r2Bucket(), Key: key }));
  } catch (error) {
    console.warn(`No se pudo borrar ${key} de R2 (puede que ya no exista).`, error);
  }
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
