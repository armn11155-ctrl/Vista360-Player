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
// baja calidad) -- se reporto que "se ven de mala calidad". Ahora son
// WebP a 1100px de ancho y calidad 90: WebP comprime muchisimo mejor
// un degradado suave que JPEG al mismo peso, asi que salen limpias
// (sin bandas) pesando 96-131KB -- bastante mas livianas que el
// original (400-460KB) pero sin sacrificar como antes. Se siguen
// precargando aca para que ya esten en cache antes de que el usuario
// llegue a verlas -- tanto en Mis Campañas como en el pin de
// Cobertura, que usan las mismas 4 fotos.
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
