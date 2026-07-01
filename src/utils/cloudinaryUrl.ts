/**
 * ¿Esta URL de evidencia es un video? Cloudinary sirve videos por un
 * path distinto (/video/upload/ en vez de /image/upload/) desde que
 * subirEvidenciaCloudinary elige el endpoint según el tipo de archivo.
 */
export function esVideo(url: string): boolean {
  return url.includes("/video/upload/");
}

/**
 * Convierte una URL de Cloudinary en una versión miniatura, insertando
 * transformaciones on-the-fly justo después de "/upload/". Cloudinary
 * genera y cachea esa versión reducida en su CDN — el navegador nunca
 * descarga el archivo original para mostrar una miniatura chica.
 *
 * Funciona tanto para fotos como para videos:
 *   - Foto: recorta/ajusta a un cuadrado y reduce peso (q_auto, f_auto).
 *   - Video: en vez de la miniatura de la foto, pide un FRAME fijo del
 *     video como imagen JPG (cambiando la extensión del archivo a
 *     .jpg) — así en el grid se ve una imagen real del video, no un
 *     ícono roto de <img> intentando reproducir un .mp4.
 *
 * Si la URL no es de Cloudinary, la devuelve sin tocar — más vale
 * mostrar la original que romper el link.
 */
export function cloudinaryThumb(url: string, size = 240): string {
  if (esVideo(url)) {
    // /video/upload/.../clip.mp4  →  /video/upload/c_fill,w,h,so_0,q_auto/.../clip.jpg
    const transformado = url.replace(
      "/video/upload/",
      `/video/upload/c_fill,w_${size},h_${size},so_0,q_auto/`
    );
    return transformado.replace(/\.[a-zA-Z0-9]+$/, ".jpg");
  }
  if (!url.includes("/image/upload/")) return url;
  return url.replace(
    "/image/upload/",
    `/image/upload/c_fill,w_${size},h_${size},q_auto,f_auto/`
  );
}
