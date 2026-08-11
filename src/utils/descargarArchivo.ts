import { registrarLimpiezaDeSesion } from "../config/firebase";

/**
 * Descarga un archivo de verdad, también en el móvil.
 *
 * EL PROBLEMA. Los botones "Descargar" eran un `<a href={url} download>`
 * apuntando a una URL firmada de R2. Y el atributo `download` SE IGNORA
 * cuando el enlace apunta a otro dominio -- que es exactamente el caso:
 * la app está en vista360player.pe y los PDFs en
 * *.r2.cloudflarestorage.com.
 *
 * Resultado en el teléfono: el enlace simplemente NAVEGA al PDF y el
 * visor del sistema lo abre. Para la persona es idéntico a pulsar "Ver",
 * y parece que el botón no funciona.
 *
 * LA SOLUCIÓN. Traer el archivo con fetch() y crear una URL de tipo
 * `blob:`, que SÍ es del mismo origen. Sobre esa, `download` funciona en
 * iOS, Android y escritorio. El bucket ya permite GET por CORS desde el
 * navegador (ver scripts/set-r2-cors.mjs), así que no hace falta nada
 * nuevo en el servidor.
 *
 * Y SI FALLA, se abre la URL como antes. Nunca peor que ahora: una
 * conexión mala o un CORS caído dejan el comportamiento anterior, no un
 * botón muerto.
 *
 * ─────────────────────────────────────────────────────────────────────
 * EL CASO DEL IPHONE, QUE ES DISTINTO.
 *
 * Safari en iOS abre los PDF en su visor pase lo que pase: ni con blob
 * ni con Content-Disposition: attachment los guarda directamente. No es
 * un fallo que se pueda arreglar desde la web.
 *
 * Lo que SÍ funciona ahí es la hoja de compartir del sistema, que trae
 * "Guardar en Archivos". Así que en los móviles que la soportan se abre
 * esa en vez de forzar una descarga que el sistema va a ignorar: la
 * persona toca "Guardar en Archivos" y el PDF queda en su teléfono, que
 * es lo que quería.
 *
 * En escritorio no existe esa hoja y la descarga por blob funciona
 * perfecta, así que ahí se usa la descarga de siempre.
 * ─────────────────────────────────────────────────────────────────────
 */

/** Tope de espera. Un PDF de reporte pesa ~150 KB; si en 20 s no llegó,
 *  es mejor abrirlo que dejar a la persona mirando un botón parado. */
const ESPERA_MAXIMA_MS = 20_000;

// Un mismo PDF se usa para Ver, Descargar, Correo y WhatsApp. Antes cada
// camino hacía su propio fetch aunque la tarjeta ya lo hubiera precargado.
// Esta caché pequeña comparte tanto la petición en curso como el Blob final:
// el primer uso paga la red y los siguientes son locales. Se limita por
// cantidad, peso y tiempo para no convertir el historial en memoria retenida.
const CACHE_BLOB_TTL_MS = 10 * 60_000;
const CACHE_BLOB_MAX_ITEMS = 8;
const CACHE_BLOB_MAX_BYTES = 24 * 1024 * 1024;
const CACHE_BLOBS = new Map<string, { blob: Blob; guardadoEn: number }>();
const PETICIONES_BLOB = new Map<string, Promise<Blob>>();
let bytesEnCache = 0;

/** Libera de inmediato los documentos privados retenidos por esta sesión. */
export function limpiarCacheArchivos(): void {
  CACHE_BLOBS.clear();
  PETICIONES_BLOB.clear();
  bytesEnCache = 0;
}

registrarLimpiezaDeSesion(limpiarCacheArchivos);

function guardarBlob(url: string, blob: Blob): Blob {
  const anterior = CACHE_BLOBS.get(url);
  if (anterior) bytesEnCache -= anterior.blob.size;
  CACHE_BLOBS.delete(url);
  CACHE_BLOBS.set(url, { blob, guardadoEn: Date.now() });
  bytesEnCache += blob.size;

  while (CACHE_BLOBS.size > CACHE_BLOB_MAX_ITEMS || bytesEnCache > CACHE_BLOB_MAX_BYTES) {
    const masAntiguo = CACHE_BLOBS.entries().next().value as
      | [string, { blob: Blob; guardadoEn: number }]
      | undefined;
    if (!masAntiguo) break;
    CACHE_BLOBS.delete(masAntiguo[0]);
    bytesEnCache -= masAntiguo[1].blob.size;
  }
  return blob;
}

function esperarConSignal(promesa: Promise<Blob>, signal?: AbortSignal): Promise<Blob> {
  if (!signal) return promesa;
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const abortar = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abortar, { once: true });
    promesa.then(
      (blob) => {
        signal.removeEventListener("abort", abortar);
        resolve(blob);
      },
      (error) => {
        signal.removeEventListener("abort", abortar);
        reject(error);
      },
    );
  });
}

/** Obtiene el archivo una sola vez aunque varias acciones lo pidan a la vez. */
export function obtenerBlobArchivo(url: string, signal?: AbortSignal): Promise<Blob> {
  const cacheado = CACHE_BLOBS.get(url);
  if (cacheado && Date.now() - cacheado.guardadoEn < CACHE_BLOB_TTL_MS) {
    // Renovar el orden LRU sin duplicar bytes.
    CACHE_BLOBS.delete(url);
    CACHE_BLOBS.set(url, cacheado);
    return esperarConSignal(Promise.resolve(cacheado.blob), signal);
  }
  if (cacheado) {
    CACHE_BLOBS.delete(url);
    bytesEnCache -= cacheado.blob.size;
  }

  let peticion = PETICIONES_BLOB.get(url);
  if (!peticion) {
    peticion = (async () => {
      const corte = new AbortController();
      const reloj = setTimeout(() => corte.abort(), ESPERA_MAXIMA_MS);
      try {
        const respuesta = await fetch(url, { signal: corte.signal });
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        return guardarBlob(url, await respuesta.blob());
      } finally {
        clearTimeout(reloj);
      }
    })().finally(() => PETICIONES_BLOB.delete(url));
    PETICIONES_BLOB.set(url, peticion);
  }
  return esperarConSignal(peticion, signal);
}

function abrirComoAntes(url: string): void {
  window.open(url, "_blank", "noopener");
}

/**
 * ¿Estamos en iOS (o iPadOS)?
 *
 * Es el ÚNICO sitio donde la descarga normal no funciona: Safari abre los
 * PDF en su visor pase lo que pase, ni con blob ni con
 * Content-Disposition: attachment.
 */
export function esIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS 13+ se hace pasar por Mac; se delata por el táctil.
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}

/** Safari necesita abrir una página REAL dentro del clic para tratarla
 * como un enlace normal y activar la pestaña. Esa página es una ruta de
 * Vista360; el PDF se carga dentro sin enseñar la dirección firmada. */
function esSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Safari\//.test(ua) && !/(Chrome|Chromium|CriOS|Edg|OPR|FxiOS)\//.test(ua);
}

/**
 * ¿Hay que usar la hoja de compartir del sistema en vez de descargar?
 *
 * SOLO en iOS, Y ESTO IMPORTA MÁS DE LO QUE PARECE.
 *
 * Antes bastaba con que el navegador soportara `navigator.canShare` con
 * archivos. El comentario decía "en escritorio no existe esa hoja" -- y
 * era falso: Chrome en macOS SÍ la tiene. Resultado comprobado en
 * producción: pulsar "Descargar" en una Mac abría el menú de compartir
 * (AirDrop, Mail, Mensajes) en vez de bajar el archivo. Y esa hoja, en
 * macOS, NO trae "Guardar en Archivos", así que no había forma de
 * descargar el PDF: el botón quedaba en "Descargando…" para siempre.
 *
 * En iOS la hoja es la única salida real. En todo lo demás (macOS,
 * Windows, Linux, Android) la descarga por blob funciona perfecta y es
 * lo que la persona espera al pulsar un botón que dice "Descargar".
 */
function puedeUsarLaHojaDelSistema(archivo: File): boolean {
  if (!esIOS()) return false;
  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [archivo] });
  } catch {
    return false;
  }
}

export async function descargarArchivo(url: string, nombre: string): Promise<void> {
  if (!url) return;

  try {
    const blob = await obtenerBlobArchivo(url);

    // Nombre limpio antes de nada: los caracteres prohibidos rompen
    // tanto el `download` como el nombre en la hoja de compartir.
    const nombreLimpio = nombre.replace(/[\\/:*?"<>|]/g, "-");

    // EN EL MÓVIL, la hoja del sistema ("Guardar en Archivos"). Es lo
    // único que de verdad guarda un PDF en iOS.
    const archivo = new File([blob], nombreLimpio, { type: blob.type || "application/pdf" });
    if (puedeUsarLaHojaDelSistema(archivo)) {
      try {
        await navigator.share({ files: [archivo], title: nombreLimpio });
        return;
      } catch (error) {
        // Si la persona cierra la hoja, NO se descarga nada más: cancelar
        // es una decisión suya, no un fallo que haya que "arreglar"
        // abriendo el archivo por su cuenta.
        if ((error as Error)?.name === "AbortError") return;
        // Cualquier otro fallo sí cae a la descarga normal.
      }
    }

    const urlLocal = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = urlLocal;
    enlace.download = nombreLimpio;
    enlace.rel = "noreferrer";
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    // Revocar en el momento corta la descarga en algunos navegadores;
    // se deja un margen y se libera la memoria después.
    setTimeout(() => URL.revokeObjectURL(urlLocal), 60_000);
  } catch (error) {
    console.warn("No se pudo descargar el archivo; se abre en una pestaña.", error);
    abrirComoAntes(url);
  }
}

/**
 * Abre un PDF SIN enseñar la dirección de R2.
 *
 * EL PROBLEMA. "Ver" era un `<a href={urlFirmada} target="_blank">`, así
 * que la barra de direcciones mostraba algo como
 * `https://vista360-evidencias.a1b2c3....r2.cloudflarestorage.com/vista360/
 * facturas/1784438525571-witr63am.pdf?X-Amz-Algorithm=...&X-Amz-Signature=...`
 *
 * Eso es feo, deja a la vista dónde está alojado todo, y expone una URL
 * firmada que quien la copie puede reenviar hasta que expire.
 *
 * LA SOLUCIÓN. Se trae el PDF y se abre como `blob:`, que el navegador
 * muestra bajo el dominio de la aplicación:
 * `blob:https://vista360player.pe/6f2a...`. Mismo PDF, sin firma a la
 * vista y con la marca propia.
 *
 * EL ORDEN IMPORTA. La pestaña se abre PRIMERO, dentro del clic. Si se
 * abriera después del `await`, el navegador ya no lo considera una
 * acción de la persona y lo bloquea como si fuera publicidad.
 */
/**
 * Muestra el PDF en la pestaña YA ABIERTA, con el nombre en el título.
 *
 * Navegar directamente a la URL `blob:` funciona, pero deja la pestaña
 * llamándose "untitled": un `blob:` no lleva nombre de archivo, así que
 * el visor de Chrome no tiene de dónde sacarlo. Con varias facturas
 * abiertas no hay forma de saber cuál es cuál.
 *
 * Metiendo el PDF en un <embed> dentro de una página propia se controla
 * el <title>, y la barra de direcciones sigue mostrando el dominio de la
 * aplicación en vez de la URL firmada de R2.
 */
function mostrarPdfConTitulo(ventana: Window, urlLocal: string, nombre: string): void {
  const titulo = (nombre || "Documento").replace(/\.pdf$/i, "");
  // Se escapa: el nombre sale de datos (el número o la fecha de la
  // factura) y aquí se está construyendo HTML.
  const seguro = titulo.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
  );
  try {
    ventana.document.open();
    ventana.document.write(
      '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
        `<title>${seguro}</title>` +
        '<style>html,body{margin:0;height:100%;background:#050a12}' +
        "embed{width:100%;height:100%;border:0}</style></head><body>" +
        `<embed src="${urlLocal}" type="application/pdf"></body></html>`
    );
    ventana.document.close();
  } catch {
    // Si por lo que sea no se puede escribir en la pestaña, se navega a
    // la URL del blob como antes: se pierde el título, no el documento.
    ventana.location.href = urlLocal;
  }
}

export async function verArchivo(url: string, _nombre: string): Promise<void> {
  if (!url) return;

  // Safari deja en segundo plano una pestaña about:blank cuyo contenido
  // cambia después de un await. En cambio, sí activa una ruta real abierta
  // directamente por el clic. Guardamos los datos antes de abrirla:
  // sessionStorage se copia al nuevo contexto del mismo origen, y la ruta
  // /visor-pdf.html trae el archivo y lo muestra como blob bajo nuestro
  // dominio SIN cargar otra copia de React/Firebase. Abrir toda la app en la
  // pestaña del PDF hacía que esa pestaña también participara en Firebase
  // Auth; al cerrarla, Safari podía propagar un estado nulo y sacar de la
  // sesión a la pestaña principal.
  if (esSafari()) {
    const token =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const clave = `vista360:visor-pdf:${token}`;
    sessionStorage.setItem(clave, JSON.stringify({ url, nombre: _nombre }));
    const rutaVisor = `/visor-pdf.html?token=${encodeURIComponent(token)}`;

    const pwaIOS =
      (/iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (/Macintosh/.test(navigator.userAgent) && (navigator.maxTouchPoints ?? 0) > 1)) &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true);

    // Una ventana nueva en la PWA de iOS aparece primero como una pantalla
    // blanca. Además, pasar primero por la ruta interna obliga a recargar
    // todo React antes de empezar a traer el PDF. Lo descargamos desde la
    // pantalla actual: la respuesta al toque es inmediata y, al terminar,
    // entramos directamente al visor nativo con zoom.
    if (pwaIOS) {
      const cargando = document.createElement("div");
      cargando.setAttribute("role", "status");
      cargando.setAttribute("aria-live", "polite");
      cargando.textContent = "Abriendo el documento…";
      Object.assign(cargando.style, {
        alignItems: "center",
        background: "#050a12",
        color: "#dce6f5",
        display: "flex",
        fontFamily: "system-ui, sans-serif",
        inset: "0",
        justifyContent: "center",
        padding: "24px",
        position: "fixed",
        zIndex: "2147483647",
      });
      document.body.appendChild(cargando);

      // iOS conserva el documento de la PWA en su back-forward cache.
      // Al volver desde el PDF restaura exactamente ese DOM, incluida esta
      // capa. La quitamos en pageshow para regresar a la app al instante.
      const tituloAnterior = document.title;
      window.addEventListener(
        "pageshow",
        () => {
          cargando.remove();
          document.title = tituloAnterior;
        },
        { once: true },
      );

      try {
        const blob = await obtenerBlobArchivo(url);
        const pdf = blob.type ? blob : new Blob([blob], { type: "application/pdf" });
        document.title = (_nombre || "Documento").replace(/\.pdf$/i, "");
        window.location.href = URL.createObjectURL(pdf);
      } catch {
        cargando.remove();
        // La ruta existente conserva el manejo de error y sirve de respaldo.
        window.location.href = rutaVisor;
      }
      return;
    }

    const ventanaSafari = window.open(rutaVisor, "_blank");

    if (ventanaSafari) {
      try {
        ventanaSafari.opener = null;
      } catch {
        // La ruta ya está abierta; esto es solo aislamiento adicional.
      }
    } else {
      // Si el navegador bloquea la pestaña, usamos la misma ruta en la
      // ventana actual. El dominio propio se conserva en ambos caminos.
      window.location.href = rutaVisor;
    }
    return;
  }

  // Dentro del gesto, antes de cualquier espera.
  //
  // SIN "noopener", Y ES A PROPÓSITO. `window.open` DEVUELVE null cuando
  // se le pasa noopener -- está en la especificación, no es un fallo del
  // navegador. Con noopener puesto, esta función abría una pestaña en
  // blanco, se quedaba sin referencia a ella, y cargaba el PDF en la
  // pestaña original: la persona veía una pestaña `about:blank` huérfana
  // que nunca se llenaba. Era justo el síntoma reportado.
  //
  // La protección que daba noopener se consigue igual anulando `opener`
  // a mano justo después, que es lo que se hace abajo.
  const ventana = window.open("", "_blank");
  if (ventana) {
    // Que la pestaña nueva no pueda tocar la que la abrió.
    try {
      ventana.opener = null;
    } catch {
      // Algún navegador no deja escribirlo; no es motivo para no abrir.
    }
    // Safari a veces crea la pestaña en segundo plano. Pedir el foco aquí,
    // todavía dentro del gesto de la persona, le da la mejor oportunidad
    // de llevarla inmediatamente al documento.
    try {
      ventana.focus();
    } catch {
      // La política del navegador puede impedirlo; el PDF abrirá igual.
    }
    // Algo mientras carga: una pestaña en blanco parece que se colgó.
    try {
      ventana.document.write(
        '<!doctype html><html><head><meta charset="utf-8"><title>Vista360</title>' +
          '<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;' +
          'justify-content:center;height:100vh;margin:0;color:#555}</style></head>' +
          "<body>Abriendo el documento…</body></html>",
      );
      ventana.document.close();
    } catch {
      // Idem: si no se puede escribir, se sigue igual.
    }
  }

  try {
    const blob = await obtenerBlobArchivo(url);
    const urlLocal = URL.createObjectURL(
      blob.type ? blob : new Blob([blob], { type: "application/pdf" })
    );

    if (ventana && !ventana.closed) {
      mostrarPdfConTitulo(ventana, urlLocal, _nombre);
      // Repetirlo al terminar cubre Safari cuando el cambio de contenido
      // hizo que la pestaña perdiera el foco durante la espera.
      try {
        ventana.focus();
      } catch {
        // El navegador decide en última instancia si cambia de pestaña.
      }
    } else {
      // Pestaña bloqueada: se navega en la actual, que también sirve.
      window.location.href = urlLocal;
    }
    setTimeout(() => URL.revokeObjectURL(urlLocal), 60_000);
  } catch (error) {
    console.warn("No se pudo abrir el archivo desde el dominio propio; se usa el enlace directo.", error);
    // Peor presentación, pero el PDF se ve igual. Nunca un botón muerto.
    if (ventana && !ventana.closed) ventana.location.href = url;
    else abrirComoAntes(url);
  }
}
