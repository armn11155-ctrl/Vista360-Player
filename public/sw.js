const CACHE = "v360player-shell-v8";
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
  const mismoOrigen = url.origin === self.location.origin;

  // REGLA DE ORO: solo se guarda lo que es PUBLICO y de NUESTRO origen.
  //
  // Antes esta rama cacheaba toda peticion GET que saliera bien, sin
  // mirar de donde venia. Eso incluia las URLs firmadas de R2: PDFs de
  // facturas, fotos de campana, comprobantes de pago. Quedaban guardados
  // en el CacheStorage del navegador y ahi seguian despues de cerrar
  // sesion, asi que en una computadora compartida el siguiente usuario
  // podia recuperar archivos privados del cliente anterior.
  //
  // Ahora nada de otro origen se cachea nunca, y del propio origen solo
  // se guardan los archivos estaticos de la app.
  if (!mismoOrigen) {
    event.respondWith(fetch(event.request));
    return;
  }

  const esAssetConHash = url.pathname.startsWith("/assets/");

  // /assets/* son los JS/CSS que Vite nombra con un hash de contenido: un
  // mismo nombre SIEMPRE tiene el mismo contenido, asi que es seguro (y
  // mucho mas rapido) servirlos desde el cache sin tocar la red.
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

  // El shell (HTML, manifest, iconos): red primero para que siempre llegue
  // la version mas nueva, con el cache solo como respaldo si se corta la
  // conexion. Se cachea unicamente esta lista corta y publica.
  const esShellPublico =
    SHELL.includes(url.pathname) ||
    /\.(png|svg|ico|webmanifest|webp|woff2?)$/i.test(url.pathname);

  if (esShellPublico) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Todo lo demas del propio origen (llamadas a datos, etc): red directa,
  // sin guardar nada.
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

// Permite que la app pida vaciar el cache al cerrar sesion (ver
// logout() en src/config/firebase.ts). Cambiar la POLITICA de cache no
// borra lo que ya quedo guardado de antes, asi que hace falta esto.
self.addEventListener("message", (event) => {
  if (event.data && event.data.tipo === "limpiar-cache") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    );
  }
});

// ── Notificaciones push (FCM) ──────────────────────────────────────
// Cuando la app está cerrada o en segundo plano, el navegador entrega
// el push acá directo (no pasa por React) -- hay que mostrar la
// notificación del sistema a mano con showNotification(). No hace
// falta el SDK completo de Firebase Messaging en el Service Worker:
// un push de FCM para web es, a fin de cuentas, un Push API normal.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  const notif = payload.notification || {};
  const datos = payload.data || {};
  const titulo = notif.title || datos.title || "Vista360 Player";
  const cuerpo = notif.body || datos.body || "";

  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: cuerpo,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: datos.url || "/" },
    })
  );
});

// Al tocar la notificación, enfoca una pestaña ya abierta si hay una,
// o abre una nueva -- así no se le abren 5 pestañas al cliente si ya
// tenía la app abierta cuando le llegó el aviso.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const cliente of lista) {
        if ("focus" in cliente) return cliente.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
