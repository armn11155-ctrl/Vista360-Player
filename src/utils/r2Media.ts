const EXTENSIONES_VIDEO = new Set(["mp4", "mov", "webm", "m4v"]);

/** ¿Esta key de R2 (o URL vieja de Cloudinary) es un video? */
export function esVideo(keyOUrl: string): boolean {
  if (keyOUrl.includes("/video/upload/")) return true; // dato viejo de Cloudinary
  const ext = keyOUrl.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSIONES_VIDEO.has(ext);
}

/** Para el grid: usa la miniatura si existe, si no el archivo original. */
export function keyDeMiniatura(key?: string, thumbKey?: string): string | undefined {
  return thumbKey || key;
}
