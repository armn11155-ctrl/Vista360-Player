const CAMPAIGN_CITY_IMAGES = [
  "/campaign-city-new-york.webp",
  "/campaign-city-los-angeles.webp",
  "/campaign-city-san-francisco.webp",
  "/campaign-city-rio.webp",
] as const;

// Precarga las 4 fotos apenas se importa este modulo (una sola vez por
// sesion) -- se reportó que la foto de fondo "aparecía" (se veía negra
// un instante) al pasar el mouse por una tarjeta. La causa real no era
// nada de CSS/hover: las fotos pesaban 400-460KB cada una y recién se
// descargaban la primera vez que el navegador las necesitaba.
//
// La primera compresion (JPEG, 900px, calidad 78) dejo las fotos
// livianas pero con bloques/bandas visibles en el cielo nocturno (los
// degradados suaves son justo donde peor se nota la compresion JPEG a
// baja calidad) -- se reporto que "se ven de mala calidad". Se paso a
// WebP (comprime un degradado suave mucho mejor que JPEG al mismo
// peso), y se probaron varios niveles de calidad comparando SIEMPRE
// contra el tamaño real en el que se muestran (una tarjeta chica, con
// el degradado oscuro encima) y no solo con zoom -- a calidad 75 ya no
// se nota ninguna banda ni al tamaño real ni haciendole zoom, y pesa
// bastante menos que el primer intento en WebP (calidad 90): quedan
// en 46-73KB cada una (el original sin comprimir pesaba 400-460KB).
// Se siguen precargando aca para que ya esten en cache antes de que
// el usuario llegue a verlas -- tanto en Mis Campañas como en el pin
// de Cobertura, que usan las mismas 4 fotos.
if (typeof window !== "undefined" && typeof Image !== "undefined") {
  CAMPAIGN_CITY_IMAGES.forEach((src) => {
    const img = new Image();
    img.src = src;
  });
}

/**
 * Asigna una ciudad de forma estable a cada campaña (o panel, si no hay
 * campaña). No usa Math.random: la tarjeta y el detalle siempre reciben
 * la misma imagen, incluso al recargar la página o entrar desde otro
 * dispositivo.
 */
export function campaignCityImage(campaignId: string): string {
  let hash = 0;
  for (let i = 0; i < campaignId.length; i += 1) {
    hash = (hash * 31 + campaignId.charCodeAt(i)) >>> 0;
  }
  return CAMPAIGN_CITY_IMAGES[hash % CAMPAIGN_CITY_IMAGES.length];
}
