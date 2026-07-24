const CAMPAIGN_CITY_NAMES = ["new-york", "los-angeles", "san-francisco", "rio"] as const;

const CAMPAIGN_CITY_IMAGES = CAMPAIGN_CITY_NAMES.map((n) => `/campaign-city-${n}.webp`);

// Version en resolucion mas alta de las mismas 4 fotos -- SOLO para el
// header grande de Detalle de campaña (.campaign-detail-hero), que se
// pinta a todo el ancho de la pantalla sin ningun degradado oscuro
// encima (a diferencia de la tarjeta de Mis Campañas, que sí tiene un
// degradado y por eso puede quedarse con la version chica). A ese
// tamaño y sin nada tapando la foto, la version de 1100px/calidad 75
// se veia borrosa/pixelada -- quedaba estirada mas alla de su
// resolucion real. Esta version usa el ancho original de la foto
// fuente (hasta 1900px, no hay mas resolucion que esa disponible) a
// calidad 78 -- se probo contra bandas visibles en los degradados de
// cielo/atardecer (el peor caso) tanto de cerca como al tamaño real
// del header, sin encontrar ninguna. Pesa mas que la version chica
// (121-181KB en vez de 46-73KB) pero sigue siendo un dato menor: son
// solo 4 fotos y esta version solo se pide cuando alguien abre el
// detalle de una campaña, no en cada tarjeta de la lista.
const CAMPAIGN_CITY_IMAGES_HERO = CAMPAIGN_CITY_NAMES.map((n) => `/campaign-city-${n}-hero.webp`);

// Precarga las 4 fotos (version chica, la que se usa en todos lados
// menos el header grande) apenas se importa este modulo (una sola vez
// por sesion) -- se reportó que la foto de fondo "aparecía" (se veía
// negra un instante) al pasar el mouse por una tarjeta. La causa real
// no era nada de CSS/hover: las fotos pesaban 400-460KB cada una y
// recién se descargaban la primera vez que el navegador las
// necesitaba.
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
// de Cobertura, que usan las mismas 4 fotos. La version "hero" (mas
// pesada, solo para Detalle de campaña) NO se precarga -- no vale la
// pena bajarla de entrada si la persona nunca abre el detalle.
if (typeof window !== "undefined" && typeof Image !== "undefined") {
  CAMPAIGN_CITY_IMAGES.forEach((src) => {
    const img = new Image();
    img.src = src;
  });
}

/** Mismo hash para las dos listas (chica y hero) -- así una campaña
 *  siempre recibe LA MISMA foto de ciudad sin importar en qué pantalla
 *  se muestre. */
function indiceCiudad(campaignId: string): number {
  let hash = 0;
  for (let i = 0; i < campaignId.length; i += 1) {
    hash = (hash * 31 + campaignId.charCodeAt(i)) >>> 0;
  }
  return hash % CAMPAIGN_CITY_NAMES.length;
}

/**
 * Asigna una ciudad de forma estable a cada campaña (o panel, si no hay
 * campaña). No usa Math.random: la tarjeta y el detalle siempre reciben
 * la misma imagen, incluso al recargar la página o entrar desde otro
 * dispositivo.
 */
export function campaignCityImage(campaignId: string): string {
  return CAMPAIGN_CITY_IMAGES[indiceCiudad(campaignId)];
}

/** Misma foto que campaignCityImage(), en la version de mayor
 *  resolucion -- usar solo para el header grande de Detalle de
 *  campaña (ver comentario de CAMPAIGN_CITY_IMAGES_HERO arriba). */
export function campaignCityImageHero(campaignId: string): string {
  return CAMPAIGN_CITY_IMAGES_HERO[indiceCiudad(campaignId)];
}
