// Vite reemplaza este marcador en dist/sw.js en CADA build. Si el archivo
// permaneciera idéntico, una PWA abierta no detectaría el nuevo despliegue.
const BUILD = "__VISTA360_BUILD__";
const CACHE = `v360player-shell-${BUILD}`;
const SHELL = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clientes) => {
        // AVISAR A LAS PESTANAS QUE YA ESTABAN ABIERTAS.
        //
        // Una pestana abierta desde ANTES del despliegue sigue
        // ejecutando el JavaScript viejo, y ese codigo pide archivos
        // .js con nombres que ya no existen. Como esas pantallas se
        // cargan dentro de un startTransition de React, el fallo no
        // produce ningun error visible: la pantalla simplemente NO
        // cambia. La persona pulsa un boton y no pasa nada.
        //
        // El Service Worker es lo unico que alcanza a esa pestana, asi
        // que desde aca se le avisa. El codigo nuevo escucha este
        // mensaje y recarga; el viejo lo ignora sin romperse.
        clientes.forEach((cliente) => {
          try {
            cliente.postMessage({ tipo: "version-nueva" });
          } catch (e) {
            /* una pestana que ya no acepta mensajes no debe frenar al resto */
          }
        });
      })
  );
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
          // Cloudflare Pages resuelve CUALQUIER ruta que no reconoce
          // devolviendo el index.html de la app (200, text/html) en vez
          // de un 404 -- es su modo "single-page-application" normal.
          // Un /assets/*.js viejo, referenciado por un index.html
          // desactualizado que alguien todavia tenia abierto o en
          // cache, cae justo en ese caso despues de un despliegue
          // nuevo (el archivo con ese hash ya no existe). Antes esa
          // respuesta se guardaba en cache IGUAL (un 200 es un 200 sin
          // mirar el contenido) -- quedaba ese "JS" con HTML adentro
          // cacheado PARA SIEMPRE bajo esa URL. El navegador lo volvia
          // a pedir, lo recibia del cache, e intentaba ejecutarlo como
          // modulo ("'text/html' is not a valid JavaScript MIME
          // type") -- y como ya estaba en cache, ni cerrar y volver a
          // abrir la pestana lo arreglaba, se repetia para siempre.
          // Ahora se verifica que la respuesta sea realmente JS/CSS
          // antes de guardarla o de darla por buena; si no, se trata
          // como una falla real de red (undefined/rechazada), asi el
          // navegador la reintenta en vez de quedarse pegado con la
          // copia envenenada.
          const tipo = res.headers.get("content-type") || "";
          if (res.ok && !tipo.includes("text/html")) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
            return res;
          }

          // LLEGO HTML DONDE DEBIA HABER JAVASCRIPT.
          //
          // Antes esto lanzaba, y la peticion moria como fallo de red: la
          // aplicacion se quedaba EN NEGRO sin decir nada. No cachear la
          // basura era correcto; rendirse no.
          //
          // La causa es el borde de Cloudflare. La regla /assets/* del
          // archivo _headers marca todo lo que cuelga de ahi como
          // "immutable, un año". Si alguien pide una ruta de /assets/
          // ANTES de que el despliegue la publique, Pages responde con el
          // index.html del SPA (200, text/html) y ESA respuesta se queda
          // cacheada un año bajo la URL del archivo. Cuando el archivo
          // real aparece, el borde sigue sirviendo el HTML viejo.
          //
          // Lo importante: el ORIGEN si tiene el archivo bueno. Se
          // comprobo que la misma URL con un parametro cualquiera devuelve
          // 200 application/javascript, porque el parametro cambia la
          // clave de cache y el borde va a buscarlo de nuevo.
          //
          // Asi que se reintenta una vez con un parametro. Si vuelve bien,
          // se guarda bajo la URL ORIGINAL (sin parametro) para que las
          // siguientes cargas no tengan que repetir el rodeo: la
          // aplicacion se cura sola, sin esperar a que expire el cache ni
          // a que nadie lo purgue a mano.
          const url = new URL(event.request.url);
          url.searchParams.set("reintento", String(Date.now()));
          return fetch(url.toString(), { cache: "reload" }).then((res2) => {
            const tipo2 = res2.headers.get("content-type") || "";
            if (!res2.ok || tipo2.includes("text/html")) {
              // El reintento tampoco trajo JavaScript: ahora si es un
              // fallo real y se deja fallar en vez de servir basura.
              throw new Error("Respuesta inesperada (no JS/CSS) para " + event.request.url);
            }
            const copia2 = res2.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copia2)).catch(() => {});
            return res2;
          });
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
    const terminado = caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      // Contestar por el puerto que mando el cliente, si lo mando. Sin
      // esto, quien limpia la cache antes de reintentar cargar una
      // pantalla no tiene forma de saber CUANDO termino, y reintenta
      // sobre la cache vieja -- que es justo lo que se venia a evitar.
      .then(() => { try { event.ports && event.ports[0] && event.ports[0].postMessage({ ok: true }); } catch (e) {} });
    event.waitUntil(terminado);
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
