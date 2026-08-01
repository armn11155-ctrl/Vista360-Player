import { httpsCallable } from "firebase/functions";
import { cloudFunctions } from "../config/firebase";

/**
 * Comparte un archivo de verdad (adjunto, no un link) usando el panel
 * nativo de "compartir" del sistema operativo (Web Share API con
 * `files`) -- es la ÚNICA forma real de que un PDF llegue adjunto a
 * WhatsApp o al correo desde el navegador: ni wa.me ni mailto: pueden
 * adjuntar nada, solo llevan texto.
 *
 * Sobre todo funciona en celular (iOS Safari, Chrome Android). En la
 * mayoría de navegadores de escritorio no hay soporte, o WhatsApp no
 * aparece como destino en el panel -- por eso quien llama a esto
 * SIEMPRE tiene que tener un mensaje con link como respaldo para
 * cuando compartirArchivoR2() devuelva false.
 */

/** Detección de soporte, sin pedirle nada al servidor todavía. */
export async function puedeCompartirArchivo(): Promise<boolean> {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  try {
    const archivoPrueba = new File([""], "prueba.pdf", { type: "application/pdf" });
    return navigator.canShare({ files: [archivoPrueba] });
  } catch {
    return false;
  }
}

/**
 * Intenta compartir un archivo de R2 adjunto de verdad (pide los
 * bytes por la Cloud Function obtenerArchivoR2Base64, arma un File y
 * abre el panel nativo de compartir). Devuelve:
 * - true: se abrió el panel de compartir (haya elegido mandarlo o
 *   cancelar -- cancelar no es un error, la persona decidió no
 *   mandarlo, no hay que caer al link en ese caso).
 * - false: no se pudo (sin soporte, sin sesión, la Cloud Function
 *   falló, etc.) -- quien llama debe caer al mensaje con link.
 */
export async function compartirArchivoR2(opts: {
  key: string;
  nombreArchivo: string;
  texto: string;
  titulo: string;
}): Promise<boolean> {
  if (!cloudFunctions) return false;
  if (!(await puedeCompartirArchivo())) return false;
  try {
    const obtenerArchivo = httpsCallable<{ key: string }, { base64: string }>(cloudFunctions, "obtenerArchivoR2Base64");
    const { data } = await obtenerArchivo({ key: opts.key });
    const binario = atob(data.base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    const archivo = new File([bytes], opts.nombreArchivo, { type: "application/pdf" });

    if (!navigator.canShare({ files: [archivo] })) return false;
    await navigator.share({ files: [archivo], text: opts.texto, title: opts.titulo });
    return true;
  } catch (error) {
    // AbortError = la persona cerró el panel sin elegir nada -- no es
    // un error real, no hay que caer al link en ese caso tampoco.
    if (error instanceof DOMException && error.name === "AbortError") return true;
    console.warn("No se pudo compartir el archivo adjunto, se usa el link como respaldo.", error);
    return false;
  }
}
