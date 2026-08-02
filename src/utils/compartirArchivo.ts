import { httpsCallable } from "firebase/functions";
import { cloudFunctions } from "../config/firebase";

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

/** Pide el archivo al servidor y arma el File -- se llama al montar
 * la tarjeta, NO en el clic, para que el archivo ya esté listo. */
export async function precargarArchivoR2(key: string, nombreArchivo: string): Promise<File | null> {
  if (!cloudFunctions) return null;
  try {
    const obtenerArchivo = httpsCallable<{ key: string }, { base64: string }>(cloudFunctions, "obtenerArchivoR2Base64");
    const { data } = await obtenerArchivo({ key });
    const binario = atob(data.base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return new File([bytes], nombreArchivo, { type: "application/pdf" });
  } catch (error) {
    console.warn("No se pudo precargar el archivo para compartir; se usará el link.", error);
    return null;
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
  try {
    await navigator.share({ files: [archivo], text: texto, title: titulo });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return true;
    console.warn("No se pudo compartir el archivo adjunto, se usa el link como respaldo.", error);
    return false;
  }
}
