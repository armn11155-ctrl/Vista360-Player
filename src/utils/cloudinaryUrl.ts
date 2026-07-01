/**
 * Convierte una URL de Cloudinary en una versión miniatura, insertando
 * transformaciones on-the-fly justo después de "/upload/". Cloudinary
 * genera y cachea esa versión reducida en su CDN — el navegador nunca
 * descarga la imagen original para mostrar una miniatura de 240px.
 *
 *   c_fill,w_240,h_240  → recorta/ajusta a un cuadrado de 240x240
 *   q_auto              → calidad automática (más liviano, casi igual visualmente)
 *   f_auto               → formato automático (WebP/AVIF si el navegador lo soporta)
 *
 * Si la URL no es de Cloudinary (o es un video, que se sirve distinto),
 * la devuelve sin tocar — más vale mostrar la original que romper el link.
 */
export function cloudinaryThumb(url: string, size = 240): string {
  if (!url.includes("/image/upload/")) return url;
  return url.replace(
    "/image/upload/",
    `/image/upload/c_fill,w_${size},h_${size},q_auto,f_auto/`
  );
}
