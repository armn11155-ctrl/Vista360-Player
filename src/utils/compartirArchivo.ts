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
 * integra con el panel de Compartir (aunque Finder sí lo muestre para
 * otros tipos de archivo); en Windows 11 con WhatsApp actualizado, sí
 * puede aparecer. Por eso quien llama a esto SIEMPRE tiene que tener
 * un mensaje con link como respaldo para cuando compartirArchivoR2()
 * devuelva false.
 *
 * OJO: antes había una función puedeCompartirArchivo() que probaba el
 * soporte armando un File VACÍO (0 bytes) de prueba y pasándoselo a
 * navigator.canShare() -- eso daba falso negativo en algunos
 * navegadores de celular (un archivo de 0 bytes no es lo mismo que un
 * PDF real, y canShare() podía rechazarlo aunque el archivo real sí
 * se hubiera compartido bien), haciendo que TODO cayera siempre al
 * link sin ni siquiera intentar el panel nativo. Ahora el chequeo de
 * soporte real se hace con el ARCHIVO DE VERDAD, después de bajarlo
 * -- el único chequeo previo (barato, sin red) es que las funciones
 * existan en el navegador.
 */

/** Intenta compartir un archivo de R2 adjunto de verdad (pide los
 * bytes por la Cloud Function obtenerArchivoR2Base64, arma un File y
 * abre el panel nativo de compartir). Devuelve:
 * - true: se abrió el panel de compartir (haya elegido mandarlo o
 *   cancelar -- cancelar no es un error, la persona decidió no
 *   mandarlo, no hay que caer al link en ese caso).
 * - false: no se pudo (sin soporte, sin sesión, la Cloud Function
 *   falló, etc.) -- quien llama debe caer al mensaje con link.
 */
/** Si pedir el archivo al servidor se cuelga (red lenta, la Cloud
 * Function tardando, etc.), no hay que dejar el botón trabado en
 * "Enviando..." para siempre -- a los 12 segundos se da por vencido y
 * cae al link, en vez de colgarse. (Esto NO limita el tiempo que la
 * persona se toma eligiendo algo en el panel nativo de compartir --
 * ese panel ya reemplazó a nuestra pantalla, el límite es solo para
 * la espera de ANTES de que se abra.) */
function conTiempoLimite<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("Se agotó el tiempo de espera.")), ms);
    promesa.then(
      (valor) => {
        clearTimeout(id);
        resolve(valor);
      },
      (error) => {
        clearTimeout(id);
        reject(error);
      }
    );
  });
}

export async function compartirArchivoR2(opts: {
  key: string;
  nombreArchivo: string;
  texto: string;
  titulo: string;
}): Promise<boolean> {
  if (!cloudFunctions) return false;
  if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") {
    return false;
  }
  try {
    const obtenerArchivo = httpsCallable<{ key: string }, { base64: string }>(cloudFunctions, "obtenerArchivoR2Base64");
    const { data } = await conTiempoLimite(obtenerArchivo({ key: opts.key }), 12000);
    const binario = atob(data.base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    const archivo = new File([bytes], opts.nombreArchivo, { type: "application/pdf" });

    // Chequeo de soporte con el archivo REAL, no uno de prueba vacío.
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
