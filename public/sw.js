const CACHE = "v360player-shell-v7";
const SHELL = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Dos estrategias segun el tipo de archivo:
//
// 1) /assets/* -- son los JS/CSS que Vite nombra con un hash de
//    contenido (ej. index-cqgnt120.js). Un mismo nombre SIEMPRE tiene
//    el mismo contenido -- si el codigo cambia, Vite genera un nombre
//    nuevo. Por eso es seguro (y mucho mas rapido) servirlos
//    "cache primero": ni se toca la red si ya estan guardados, y si
//    no estan, se piden una vez y quedan listos para la proxima. Antes
//    esto tambien iba por red primero, agregando una espera de
//    verdad inutil en cada carga para archivos que nunca cambian.
//
// 2) Todo lo demas (el shell HTML, manifest, llamadas a Firebase,
//    etc.) -- sigue siendo "red primero, cache de respaldo", para que
//    el usuario reciba siempre la version mas nueva de la app y de
//    los datos, y el shell solo caiga al cache si se corta la
//    conexion.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const esAssetConHash = url.origin === self.location.origin && url.pathname.startsWith("/assets/");

  if (esAssetConHash) {
    event.respondWith(
      caches.match(event.request).then((cacheado) => {
        if (cacheado) return cacheado;
        return fetch(event.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
          return res;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
