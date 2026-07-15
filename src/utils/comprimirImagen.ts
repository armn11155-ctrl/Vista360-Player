/**
 * Comprime una imagen en el navegador ANTES de subirla — reduce el peso
 * 10-15x sin que se note a simple vista (una foto de celular de 5-8MB
 * queda en 150-400KB). Esto estira muchísimo cualquier límite gratuito
 * de almacenamiento (Cloudinary, Firebase) sin gastar ni arriesgar nada.
 *
 * Intenta primero WebP (formato más moderno y eficiente que JPEG — misma
 * calidad visual, 25-35% menos peso) y si el navegador no lo soporta bien
 * para codificar, cae de vuelta a JPEG automáticamente. No todos los
 * navegadores viejos/Safari antiguos codifican WebP desde <canvas>, así
 * que SIEMPRE se verifica que el resultado realmente sea WebP antes de
 * usarlo — si no, no se arriesga nada, se usa JPEG.
 *
 * Solo aplica a imágenes — los videos se suben tal cual, comprimirlos
 * en el navegador requiere librerías pesadas que no valen la pena para
 * este caso de uso.
 */
const MAX_DIMENSION = 1920; // suficiente para verse nítido en cualquier pantalla
const WEBP_QUALITY = 0.82; // visualmente ≥ que JPEG 80%, y más liviano
const JPEG_QUALITY = 0.8;
const AVATAR_SIZE = 320;
const AVATAR_WEBP_QUALITY = 0.86;

async function codificar(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function comprimirImagen(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return file; // no tocar videos ni GIFs animados
  }

  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;

    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // Intentar WebP primero — más liviano a igual calidad visual.
    let blob = await codificar(canvas, "image/webp", WEBP_QUALITY);
    let extension = "webp";
    let mime = "image/webp";

    // Algunos navegadores (Safari viejo) ignoran el "image/webp" pedido
    // y devuelven PNG (pesadísimo) o null — en ese caso, usar JPEG.
    if (!blob || blob.type !== "image/webp") {
      blob = await codificar(canvas, "image/jpeg", JPEG_QUALITY);
      extension = "jpg";
      mime = "image/jpeg";
    }

    if (!blob) return file;

    // Si por algún motivo la "comprimida" salió más pesada que el
    // original (pasa con imágenes ya muy comprimidas), nos quedamos
    // con el original — nunca empeoramos el resultado.
    if (blob.size >= file.size) return file;

    const nuevoNombre = file.name.replace(/\.[^.]+$/, "") + "." + extension;
    return new File([blob], nuevoNombre, { type: mime });
  } catch {
    // Si algo falla (navegador viejo, archivo raro), subimos el
    // original sin comprimir — nunca bloqueamos la subida por esto.
    return file;
  }
}

export async function comprimirAvatarWebp(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    throw new Error("El avatar debe ser una imagen estática.");
  }

  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = Math.round((bitmap.width - side) / 2);
  const sy = Math.round((bitmap.height - side) / 2);

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    bitmap.close();
    throw new Error("No se pudo preparar la imagen.");
  }

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();

  const blob = await codificar(canvas, "image/webp", AVATAR_WEBP_QUALITY);
  if (!blob || blob.type !== "image/webp") {
    throw new Error("Tu navegador no pudo convertir el avatar a WebP.");
  }

  const nombre = file.name.replace(/\.[^.]+$/, "") || "avatar";
  return new File([blob], `${nombre}.webp`, { type: "image/webp" });
}
