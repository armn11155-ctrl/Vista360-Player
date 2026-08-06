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
function esIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS 13+ se hace pasar por Mac; se delata por el táctil.
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
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

  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), ESPERA_MAXIMA_MS);
  try {
    const respuesta = await fetch(url, { signal: corte.signal });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const blob = await respuesta.blob();

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
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Abre el PDF en la pestaña actual.
 *
 * No se usa window.open: Safari puede crear una pestaña nueva que pasa
 * desapercibida para la persona. Primero se trae el archivo como blob para
 * no exponer la URL firmada de R2 y luego se navega en esta misma pestaña.
 * El botón Atrás del navegador devuelve al portal.
 */
export async function verArchivo(url: string, _nombre: string): Promise<void> {
  if (!url) return;

  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), ESPERA_MAXIMA_MS);
  try {
    const respuesta = await fetch(url, { signal: corte.signal });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const blob = await respuesta.blob();
    const urlLocal = URL.createObjectURL(
      blob.type ? blob : new Blob([blob], { type: "application/pdf" })
    );

    window.location.assign(urlLocal);
    // En la navegación normal la página se descarga y este temporizador no
    // llega a ejecutarse. Si la navegación se cancela, libera la memoria.
    setTimeout(() => URL.revokeObjectURL(urlLocal), 60_000);
  } catch (error) {
    console.warn("No se pudo abrir el archivo desde el dominio propio; se usa el enlace directo.", error);
    // Peor presentación, pero el PDF se ve en la misma pestaña.
    window.location.assign(url);
  } finally {
    clearTimeout(reloj);
  }
}
