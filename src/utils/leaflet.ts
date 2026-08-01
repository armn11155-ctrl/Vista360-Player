let leafletPromesa: Promise<typeof import("leaflet")> | null = null;

/**
 * Carga Leaflet (mapa) una sola vez -- lo usan tanto Cobertura.tsx (ver
 * paneles en el mapa) como Paneles.tsx (elegir la ubicación de un panel
 * nuevo con un click).
 *
 * Antes esto bajaba leaflet.js y leaflet.css desde unpkg.com en tiempo
 * de ejecución (una petición aparte a un servidor de terceros, cada vez
 * que el navegador no lo tuviera ya en su cache HTTP nativo -- algo
 * frecuente en celular/PWA, donde el sistema operativo puede vaciar ese
 * cache en cualquier momento). Eso hacía que Cobertura dependiera de que
 * unpkg.com respondiera rápido, ADEMÁS de la propia conexión del
 * usuario -- justo lo contrario de lo que se busca para que la app
 * funcione bien con poca señal.
 *
 * Ahora Leaflet es una dependencia normal de npm: Vite lo empaqueta como
 * un archivo propio (mismo origen, nombre con hash de contenido), así
 * que lo cachea el Service Worker igual que el resto de /assets/* --
 * "cache primero", sin tocar la red de nuevo una vez que se descargó la
 * primera vez, y sin depender de que un tercero esté disponible.
 *
 * Sigue siendo un import DINÁMICO (no uno normal arriba del archivo) a
 * propósito: así el código de Leaflet no engorda el bundle inicial y
 * solo se pide cuando alguien realmente abre Cobertura o Paneles --
 * mismo comportamiento de antes, ahora sin CDN externo.
 */
export function cargarLeaflet(): Promise<typeof import("leaflet")> {
  if (!leafletPromesa) {
    leafletPromesa = Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]).then(
      ([L]) => L
    );
    // Si falla (paquete corrupto en cache, error de build, etc.), no
    // dejar la promesa "envenenada" para siempre -- el próximo que la
    // pida vuelve a intentar desde cero en vez de fallar por algo que
    // ya pasó.
    leafletPromesa.catch(() => {
      leafletPromesa = null;
    });
  }
  return leafletPromesa;
}

/**
 * El zoom más alejado que se puede mostrar sin que aparezcan franjas
 * grises (zonas del mapa donde no hay mundo que dibujar).
 *
 * El mapa del mundo en Leaflet/Web Mercator es siempre CUADRADO en
 * píxeles a cualquier zoom: 256 * 2^zoom de lado, tanto de ancho como
 * de alto. Un recuadro de mapa que no sea cuadrado (un celular es más
 * alto que ancho; una pantalla ancha es más ancha que alta) sólo se
 * llena por completo, sin gris en ningún lado, cuando ese cuadrado de
 * mundo es al menos tan grande como el lado MÁS LARGO del recuadro.
 * Si se llenara solo por el lado corto, sobraría gris en el otro.
 *
 * Por eso la cuenta usa el lado más largo (Math.max(ancho, alto)) y
 * redondea hacia arriba: el zoom entero más chico (o sea, el más
 * alejado posible) para el que el mundo ya no deja ver gris en ese
 * recuadro exacto.
 */
export function zoomMinimoSinGris(anchoPx: number, altoPx: number): number {
  const lado = Math.max(anchoPx, altoPx);
  if (!Number.isFinite(lado) || lado <= 0) return 2;
  return Math.max(0, Math.ceil(Math.log2(lado / 256)));
}

/** Un punto en pantalla (pixeles) identificado, para agrupar por cercania. */
export interface PuntoConId {
  id: string;
  x: number;
  y: number;
}

/**
 * Agrupa puntos por cercanía en pantalla (pixeles), encadenado: si A
 * está cerca de B y B está cerca de C, los tres quedan en el mismo
 * grupo aunque A y C no estén cerca entre sí -- evita que, tras
 * separar a dos pines de un vecino común, esos dos queden pegados
 * entre sí.
 *
 * Se usa para detectar pines de mapa que quedan visualmente pegados a
 * un zoom dado, sin depender de que sus coordenadas geográficas
 * coincidan de forma exacta: dos paneles a pocos metros reales de
 * distancia (un poste distinto, la vereda de enfrente) pueden caer
 * sobre los mismos pixeles con el mapa alejado, y agrupar solo por
 * coordenada EXACTA los dejaba pasar -- un pin tapaba al otro por
 * completo sin que nada los separara.
 */
export function agruparPorCercania<T extends PuntoConId>(puntos: T[], umbralPx: number): T[][] {
  const visitados = new Set<string>();
  const grupos: T[][] = [];
  puntos.forEach((punto) => {
    if (visitados.has(punto.id)) return;
    const grupo = [punto];
    visitados.add(punto.id);
    for (let i = 0; i < grupo.length; i++) {
      puntos.forEach((otro) => {
        if (visitados.has(otro.id)) return;
        const dx = grupo[i].x - otro.x;
        const dy = grupo[i].y - otro.y;
        if (Math.sqrt(dx * dx + dy * dy) <= umbralPx) {
          grupo.push(otro);
          visitados.add(otro.id);
        }
      });
    }
    grupos.push(grupo);
  });
  return grupos;
}

/**
 * Para un grupo de N pines que comparten (o casi) el mismo lugar,
 * calcula el offset en pixeles (dx, dy) que le toca a cada uno para
 * separarlos en un círculo parejo alrededor del centro del grupo.
 */
export function offsetsCirculares(n: number, radioPx: number): Array<{ dx: number; dy: number }> {
  return Array.from({ length: n }, (_, i) => {
    const angulo = (2 * Math.PI * i) / n;
    return { dx: Math.cos(angulo) * radioPx, dy: Math.sin(angulo) * radioPx };
  });
}
