const CAMPAIGN_CITY_IMAGES = [
  "/campaign-city-new-york.jpg",
  "/campaign-city-los-angeles.jpg",
  "/campaign-city-san-francisco.jpg",
  "/campaign-city-rio.jpg",
] as const;

/**
 * Asigna una ciudad de forma estable a cada campaña. No usa Math.random:
 * la tarjeta y el detalle siempre reciben la misma imagen, incluso al
 * recargar la página o entrar desde otro dispositivo.
 */
export function campaignCityImage(campaignId: string): string {
  let hash = 0;
  for (let i = 0; i < campaignId.length; i += 1) {
    hash = (hash * 31 + campaignId.charCodeAt(i)) >>> 0;
  }
  return CAMPAIGN_CITY_IMAGES[hash % CAMPAIGN_CITY_IMAGES.length];
}
