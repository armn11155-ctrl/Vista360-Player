const CAMPAIGN_CITY_IMAGES = [
  "/campaign-city-new-york.jpg",
  "/campaign-city-los-angeles.jpg",
  "/campaign-city-san-francisco.jpg",
  "/campaign-city-rio.jpg",
] as const;

// Precarga las 4 fotos apenas se importa este modulo (una sola vez por
// sesion) -- se reportó que la foto de fondo "aparecía" (se veía negra
// un instante) al pasar el mouse por una tarjeta. La causa real no era
// nada de CSS/hover: las fotos pesaban 400-460KB cada una y recién se
// descargaban la primera vez que el navegador las necesitaba. Ya se
// comprimieron a ~50-70KB (de 1800px+ de ancho bajaron a 900px, sobra
// para el tamaño que se muestran), y ademas se precargan aca para que
// ya esten en cache antes de que el usuario llegue a verlas -- tanto
// en Mis Campañas como en el pin de Cobertura, que usan las mismas 4
// fotos.
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
