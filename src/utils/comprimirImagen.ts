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
// Las fotos de campaña son "fotitos" chicas dentro de la app (grid +
// reporte en PDF, que igual las vuelve a comprimir a 1200px del lado
// del servidor) — no hace falta guardarlas grandes. Bajado de 1920px
// calidad 82% a esto: probado contra un cielo degradado (peor caso de
// banding) y un panel con texto (peor caso de nitidez), sin pérdida
// visible en ninguno de los dos.
const MAX_DIMENSION = 1280;
const WEBP_QUALITY = 0.68;
const JPEG_QUALITY = 0.66;
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

/**
 * Posición del recorte dentro de la foto — mismo formato que CSS
 * object-position: 0% es la esquina superior/izquierda de la imagen,
 * 100% la esquina opuesta, 50% (por defecto) el centro. Así el recorte
 * final coincide exactamente con lo que el usuario vio y movió en el
 * panel de "Cambiar foto de perfil".
 */
export interface PosicionRecorte {
  x: number;
  y: number;
}

export async function comprimirAvatarWebp(file: File, posicion: PosicionRecorte = { x: 50, y: 50 }): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    throw new Error("El avatar debe ser una imagen estática.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Pasa sobre todo con fotos HEIC/HEIF (formato nativo de iPhone) en
    // navegadores que no las decodifican fuera de Safari/iOS — el canvas
    // nunca llega a recibir la imagen.
    throw new Error(
      "No se pudo abrir esa foto. Si es un archivo HEIC (típico de iPhone), conviértela a JPG o PNG y vuelve a intentar."
    );
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const maxOffsetX = bitmap.width - side;
  const maxOffsetY = bitmap.height - side;
  const sx = Math.round((Math.min(100, Math.max(0, posicion.x)) / 100) * maxOffsetX);
  const sy = Math.round((Math.min(100, Math.max(0, posicion.y)) / 100) * maxOffsetY);

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

  let blob = await codificar(canvas, "image/webp", AVATAR_WEBP_QUALITY);
  let extension = "webp";
  let mime = "image/webp";

  if (!blob || blob.type !== "image/webp") {
    blob = await codificar(canvas, "image/jpeg", 0.84);
    extension = "jpg";
    mime = "image/jpeg";
  }

  if (!blob) {
    throw new Error("No se pudo preparar la foto.");
  }

  const nombre = file.name.replace(/\.[^.]+$/, "") || "avatar";
  return new File([blob], `${nombre}.${extension}`, { type: mime });
}
