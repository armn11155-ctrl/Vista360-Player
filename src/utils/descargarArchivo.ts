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

/** ¿Este navegador puede ofrecer la hoja de compartir con archivos?
 *  En iOS y Android incluye "Guardar en Archivos" / "Descargas". */
function puedeUsarLaHojaDelSistema(archivo: File): boolean {
  if (typeof navigator === "undefined") return false;
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
export async function verArchivo(url: string, _nombre: string): Promise<void> {
  if (!url) return;

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

  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), ESPERA_MAXIMA_MS);
  try {
    const respuesta = await fetch(url, { signal: corte.signal });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const blob = await respuesta.blob();
    const urlLocal = URL.createObjectURL(
      blob.type ? blob : new Blob([blob], { type: "application/pdf" })
    );

    if (ventana && !ventana.closed) {
      ventana.location.href = urlLocal;
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
  } finally {
    clearTimeout(reloj);
  }
}
