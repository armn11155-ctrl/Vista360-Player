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
 */

/** Tope de espera. Un PDF de reporte pesa ~150 KB; si en 20 s no llegó,
 *  es mejor abrirlo que dejar a la persona mirando un botón parado. */
const ESPERA_MAXIMA_MS = 20_000;

function abrirComoAntes(url: string): void {
  window.open(url, "_blank", "noopener");
}

export async function descargarArchivo(url: string, nombre: string): Promise<void> {
  if (!url) return;

  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), ESPERA_MAXIMA_MS);
  try {
    const respuesta = await fetch(url, { signal: corte.signal });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const blob = await respuesta.blob();

    const urlLocal = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = urlLocal;
    // Nombre limpio: los caracteres prohibidos en un nombre de archivo
    // hacen que algunos navegadores descarten el `download` entero y
    // vuelvan a abrirlo en vez de guardarlo.
    enlace.download = nombre.replace(/[\\/:*?"<>|]/g, "-");
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
