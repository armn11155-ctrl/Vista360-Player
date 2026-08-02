/**
 * Comparte un archivo de verdad (adjunto, no un link) usando el panel
 * nativo de "compartir" del sistema operativo (Web Share API con
 * `files`) -- es la ÚNICA forma real de que un PDF llegue adjunto a
 * WhatsApp o al correo desde el navegador: ni wa.me ni mailto: pueden
 * adjuntar nada, solo llevan texto.
 *
 * Sobre todo funciona en celular (iOS Safari, Chrome Android). En
 * computadora depende del sistema: en Mac, WhatsApp Desktop no se
 * integra con el panel de Compartir; en Windows 11 con WhatsApp
 * actualizado, sí puede aparecer.
 *
 * IMPORTANTE -- por qué esto está partido en "precargar" + "compartir"
 * en vez de una sola función que hace todo en el clic:
 *
 * navigator.share() (y su respaldo, window.open()) necesitan
 * "activación transitoria" -- básicamente, tienen que dispararse muy
 * cerca del toque/clic real de la persona. La primera versión de esto
 * pedía el archivo al servidor (una llamada de red) DENTRO del clic, y
 * recién cuando esa respuesta llegaba, intentaba compartir. En
 * computadora esa espera es de milisegundos y no se nota, pero en
 * celular con red mas lenta esa espera podía ser de varios segundos --
 * tiempo suficiente para que el navegador considerara "vencida" la
 * activación del toque, y entonces TANTO share() como el link de
 * respaldo se quedaban sin hacer nada, en silencio (ni error ni panel
 * ni link -- exactamente el "se queda enviando y no pasa nada" que se
 * reportó).
 *
 * La solución: precargar el archivo ANTES de que la persona toque el
 * botón (apenas se abre la tarjeta del reporte/factura), y que el
 * clic solo llame a share() con el archivo YA en memoria -- sin
 * ningún await de red de por medio, así la activación sigue "fresca".
 */

export interface ArchivoPrecargado {
  archivo: File | null;
  /** Motivo por el que NO se pudo dejar el archivo listo (falla del
   *  pedido al servidor) -- se guarda el mensaje real del error para
   *  poder mostrarlo en pantalla y diagnosticar sin acceso a la
   *  consola del navegador (el admin lo puede leer y avisar). */
  error?: string;
}

/**
 * Trae el archivo con un fetch() DIRECTO del navegador a la URL YA
 * FIRMADA (la misma que ya usan los botones "Ver"/"Descargar" -- ver
 * useSignedUrls) -- sin pasar por ningún Cloud Function. Esto es lo
 * que hace que compartir el PDF real sea tan simple y confiable en
 * Reporte/Factura como ya lo es en Cotización (que arma el PDF
 * enteramente en el navegador y nunca dependió de ningún servidor
 * para esto).
 *
 * Requiere que el bucket de R2 tenga CORS habilitado para GET (ver
 * scripts/set-r2-cors.mjs) -- si no, este fetch() falla con un
 * TypeError de red (no es un 403: el navegador ni deja leer la
 * respuesta) y se cae al link, igual que antes.
 */
export async function precargarArchivoR2(urlFirmada: string, nombreArchivo: string): Promise<ArchivoPrecargado> {
  if (!urlFirmada) return { archivo: null, error: "No hay URL del archivo todavía." };
  try {
    const respuesta = await fetch(urlFirmada);
    if (!respuesta.ok) {
      return { archivo: null, error: `El servidor respondió ${respuesta.status} al pedir el archivo.` };
    }
    const blob = await respuesta.blob();
    return { archivo: new File([blob], nombreArchivo, { type: "application/pdf" }) };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido al pedir el archivo.";
    console.warn("No se pudo precargar el archivo para compartir; se usará el link.", error);
    return { archivo: null, error: mensaje };
  }
}

/** ¿Este archivo (ya precargado) se puede compartir de verdad en este
 * navegador? Chequeo síncrono, sin red -- seguro de llamar en el clic. */
export function puedeCompartirEsteArchivo(archivo: File | null): archivo is File {
  if (!archivo) return false;
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [archivo] });
  } catch {
    return false;
  }
}

/** Motivo, en texto, de por qué el archivo ya precargado NO se puede
 *  compartir con el panel nativo en este navegador -- para mostrar en
 *  pantalla y diagnosticar sin acceso a la consola. */
export function motivoSinCompartirArchivo(archivo: File | null): string {
  if (!archivo) return "no se pudo preparar el archivo";
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") {
    return "este navegador no tiene panel nativo de compartir con archivos";
  }
  try {
    if (!navigator.canShare({ files: [archivo] })) return "este navegador/app no acepta compartir este archivo";
  } catch (error) {
    return error instanceof Error ? error.message : "error al comprobar si se puede compartir";
  }
  return "";
}

/**
 * Comparte un archivo YA precargado. Se debe llamar de forma
 * SÍNCRONA respecto al clic (sin ningún await antes) -- lo que pasa
 * ADENTRO de esta función es async (navigator.share() devuelve una
 * promesa que se resuelve cuando la persona termina en el panel
 * nativo), pero la LLAMADA a navigator.share() en sí ocurre de
 * inmediato, en el mismo tick del clic.
 *
 * Devuelve:
 * - true: se abrió el panel y se compartió, o la persona lo cerró sin
 *   elegir nada (cancelar no es un error, no hay que caer al link).
 * - false: falló de verdad -- quien llama debe caer al link.
 */
export async function compartirArchivoPrecargado(archivo: File, texto: string, titulo: string): Promise<boolean> {
  // WhatsApp (confirmado por varios reportes, incluye issues abiertos
  // en proyectos que envuelven el share nativo) NO muestra ningun
  // cuadro de "leyenda"/caption cuando el archivo compartido es un
  // documento (PDF) -- ese cuadro SI existe para fotos/videos, pero
  // no para documentos. Es un comportamiento de la app de WhatsApp al
  // recibir el archivo, no de este codigo: el "text" que se manda en
  // navigator.share() simplemente no tiene donde mostrarse ahi. Como
  // respaldo, se copia el mensaje al portapapeles ANTES de compartir
  // (asi la actiavcion sigue fresca para el share que viene despues),
  // para que se pueda pegar como mensaje aparte apenas se manda el PDF.
  try {
    await navigator.clipboard?.writeText?.(texto);
  } catch {
    // Sin permiso o sin soporte -- no es grave, el archivo se
    // comparte igual, solo no queda copiado de antemano.
  }
  try {
    await navigator.share({ files: [archivo], text: texto, title: titulo });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return true;
    console.warn("No se pudo compartir el archivo adjunto, se usa el link como respaldo.", error);
    return false;
  }
}
