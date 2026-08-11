import { esIOS, obtenerBlobArchivo } from "./descargarArchivo";

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
export async function precargarArchivoR2(
  urlFirmada: string,
  nombreArchivo: string,
  signal?: AbortSignal,
): Promise<ArchivoPrecargado> {
  if (!urlFirmada) return { archivo: null, error: "No hay URL del archivo todavía." };
  try {
    const blob = await obtenerBlobArchivo(urlFirmada, signal);
    return { archivo: new File([blob], nombreArchivo, { type: "application/pdf" }) };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { archivo: null };
    }
    const mensaje = error instanceof Error ? error.message : "Error desconocido al pedir el archivo.";
    console.warn("No se pudo precargar el archivo para compartir; se usará el link.", error);
    return { archivo: null, error: mensaje };
  }
}

/** ¿Este archivo (ya precargado) se puede compartir de verdad en este
 * navegador? Chequeo síncrono, sin red -- seguro de llamar en el clic. */
export function puedeCompartirEsteArchivo(archivo: File | null): archivo is File {
  if (!archivo) return false;
  // SOLO EN iOS, igual que descargarArchivo.ts.
  //
  // Comprobado en produccion, en un Mac: `navigator.share` existe en
  // Chrome de escritorio y `canShare({files})` devuelve true, asi que se
  // entraba por aca. Pero share() abre la hoja del sistema y su promesa
  // NO se resuelve hasta que la persona la cierra -- el boton se quedaba
  // en "Enviando..." indefinidamente, y el `finally` que limpia ese
  // estado no llegaba a ejecutarse.
  //
  // Ademas esa hoja, en macOS, no ofrece WhatsApp: aunque no se colgara,
  // no llevaria a donde la persona quiere ir. En escritorio el camino
  // correcto es el enlace de WhatsApp (irAlLink), que abre WhatsApp Web
  // con el mensaje puesto y sin enviar nada solo.
  if (!esIOS()) return false;
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
  if (!esIOS()) return "en escritorio se usa el enlace de WhatsApp, no el panel del sistema";
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
/**
 * Convierte un archivo ya en memoria a base64, para mandarlo como
 * adjunto real en un correo desde el backend (ver
 * functions/src/enviarCorreoConPdf.ts) -- las Cloud Functions
 * callable solo pueden llevar datos serializables (JSON), no un
 * objeto File/Blob directo. Se arma en trozos de 32KB para no romper
 * con archivos grandes (pasarle un array gigante a
 * String.fromCharCode de una sola vez puede reventar el límite de
 * argumentos del motor de JS).
 */
export async function archivoABase64(archivo: File): Promise<string> {
  const buffer = await archivo.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binario = "";
  const TAMANO_TROZO = 0x8000;
  for (let i = 0; i < bytes.length; i += TAMANO_TROZO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TAMANO_TROZO));
  }
  return btoa(binario);
}

export async function compartirArchivoPrecargado(archivo: File, texto: string, titulo: string): Promise<boolean> {
  try {
    await navigator.share({ files: [archivo], text: texto, title: titulo });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return true;
    console.warn("No se pudo compartir el archivo adjunto, se usa el link como respaldo.", error);
    return false;
  }
}
