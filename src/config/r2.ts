import { getFunctions, httpsCallable } from "firebase/functions";
import { getAuth } from "firebase/auth";
import { app } from "./firebase";

/**
 * Sube archivos a R2 (privado) en 2 pasos:
 *  1. Pide al backend una URL firmada de subida (PUT) — solo el admin
 *     puede pedirla (lo valida crearSubidaR2 en Cloud Functions).
 *  2. Sube el archivo directo a R2 con esa URL (nunca pasa por el
 *     backend, así que no hay límite de tamaño de Cloud Functions).
 *
 * Además, para fotos y videos, genera y sube una MINIATURA nítida en
 * WebP (recorte cuadrado, calidad alta) — así el grid de evidencias
 * nunca descarga el archivo original solo para mostrar un thumbnail.
 */

const THUMB_SIZE = 480; // nítido incluso en pantallas retina de un grid chico
const THUMB_QUALITY = 0.85;

interface SubidaR2 {
  key: string;
  thumbKey?: string;
}

async function pedirUrlFirmada(folder: string, extension: string, contentType: string) {
  const functions = getFunctions(app ?? undefined);
  const crearSubidaR2 = httpsCallable<
    { folder: string; extension: string; contentType: string },
    { key: string; uploadUrl: string }
  >(functions, "crearSubidaR2");
  const result = await crearSubidaR2({ folder, extension, contentType });
  return result.data;
}

async function subirBlob(uploadUrl: string, blob: Blob, contentType: string) {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!res.ok) {
    throw new Error("No se pudo subir el archivo a R2. Intenta de nuevo.");
  }
}

function codificarCanvas(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
}

/** Genera una miniatura cuadrada WebP nítida a partir de una imagen. */
async function miniaturaDeImagen(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = Math.round((bitmap.width - side) / 2);
    const sy = Math.round((bitmap.height - side) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, THUMB_SIZE, THUMB_SIZE);
    bitmap.close();
    return await codificarCanvas(canvas, THUMB_QUALITY);
  } catch {
    return null;
  }
}

/** Genera una miniatura WebP a partir del primer frame visible de un video. */
async function miniaturaDeVideo(file: File): Promise<Blob | null> {
  try {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;

    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadeddata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("No se pudo leer el video.")), { once: true });
      video.currentTime = 0.1;
    });

    const side = Math.min(video.videoWidth, video.videoHeight);
    const sx = Math.round((video.videoWidth - side) / 2);
    const sy = Math.round((video.videoHeight - side) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE;
    const ctx = canvas.getContext("2d");
    URL.revokeObjectURL(url);
    if (!ctx) return null;
    ctx.drawImage(video, sx, sy, side, side, 0, 0, THUMB_SIZE, THUMB_SIZE);
    return await codificarCanvas(canvas, THUMB_QUALITY);
  } catch {
    return null;
  }
}

function extensionDe(file: File) {
  const match = /\.([a-zA-Z0-9]+)$/.exec(file.name);
  return match ? match[1] : file.type.split("/")[1] ?? "bin";
}

async function subirArchivoYMiniatura(file: File, folder: "vista360/campanas" | "vista360/avatares"): Promise<SubidaR2> {
  const auth = getAuth(app ?? undefined);
  if (!auth.currentUser) {
    throw new Error("Debes iniciar sesión para subir archivos.");
  }

  const esVideo = file.type.startsWith("video/");
  const contentType = file.type || (esVideo ? "video/mp4" : "image/webp");

  const { key, uploadUrl } = await pedirUrlFirmada(folder, extensionDe(file), contentType);
  await subirBlob(uploadUrl, file, contentType);

  const miniatura = esVideo ? await miniaturaDeVideo(file) : await miniaturaDeImagen(file);
  if (!miniatura) {
    // Si no se pudo generar la miniatura (navegador raro, video corrupto),
    // seguimos igual — el original ya subió bien, solo no habrá thumb.
    return { key };
  }

  const { key: thumbKey, uploadUrl: thumbUploadUrl } = await pedirUrlFirmada(folder, "webp", "image/webp");
  await subirBlob(thumbUploadUrl, miniatura, "image/webp");

  return { key, thumbKey };
}

export async function subirEvidenciaR2(file: File): Promise<SubidaR2> {
  return subirArchivoYMiniatura(file, "vista360/campanas");
}

export async function subirAvatarR2(file: File): Promise<SubidaR2> {
  return subirArchivoYMiniatura(file, "vista360/avatares");
}

export async function subirFacturaR2(file: File): Promise<{ key: string }> {
  const auth = getAuth(app ?? undefined);
  if (!auth.currentUser) {
    throw new Error("Debes iniciar sesión para subir facturas.");
  }
  if (file.type !== "application/pdf") {
    throw new Error("Sube un PDF válido.");
  }
  const { key, uploadUrl } = await pedirUrlFirmada("vista360/facturas", "pdf", "application/pdf");
  await subirBlob(uploadUrl, file, "application/pdf");
  return { key };
}
