/**
 * Comprime una imagen en el navegador ANTES de subirla — reduce el peso
 * 10-15x sin que se note a simple vista (una foto de celular de 5-8MB
 * queda en 200-500KB). Esto estira muchísimo cualquier límite gratuito
 * de almacenamiento (Cloudinary, Firebase) sin gastar ni arriesgar nada.
 *
 * Solo aplica a imágenes — los videos se suben tal cual, comprimirlos
 * en el navegador requiere librerías pesadas que no valen la pena para
 * este caso de uso.
 */
const MAX_DIMENSION = 1920; // suficiente para verse nítido en cualquier pantalla
const JPEG_QUALITY = 0.8;

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

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) return file;

    // Si por algún motivo la "comprimida" salió más pesada que el
    // original (pasa con imágenes ya muy comprimidas), nos quedamos
    // con el original — nunca empeoramos el resultado.
    if (blob.size >= file.size) return file;

    const nuevoNombre = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nuevoNombre, { type: "image/jpeg" });
  } catch {
    // Si algo falla (navegador viejo, archivo raro), subimos el
    // original sin comprimir — nunca bloqueamos la subida por esto.
    return file;
  }
}
