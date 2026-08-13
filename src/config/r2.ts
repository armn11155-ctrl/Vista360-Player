import { getFunctions, httpsCallable } from "firebase/functions";
import { getAuth } from "firebase/auth";
import { app } from "./firebase";

/**
 * Sube archivos a R2 (privado) en 2 pasos:
 *  1. Pide al backend una URL firmada de subida (PUT) — solo el admin
 *     puede pedirla (lo valida crearSubidaR2 en Cloud Functions).
 *  2. Sube el archivo directo a R2 con esa URL (nunca pasa por el
 *     backend, así que no hay límite de tamaño de Cloud Functions).
 *
 * Las fotos de reporte y las facturas usan este flujo directo. El avatar,
 * por ser pequeño, pasa por una Function que actualiza su referencia.
 */

interface SubidaR2 {
  key: string;
  thumbKey?: string;
}

async function pedirUrlFirmada(
  folder: string,
  extension: string,
  contentType: string,
  /** Tamaño real del archivo. Viaja al servidor, que lo valida contra el
   *  tope y lo incluye en la firma: la URL que devuelve sirve para ESE
   *  peso y ningún otro. */
  contentLength: number
) {
  const functions = getFunctions(app ?? undefined);
  const crearSubidaR2 = httpsCallable<
    { folder: string; extension: string; contentType: string; contentLength: number },
    { key: string; uploadUrl: string }
  >(functions, "crearSubidaR2");
  const result = await crearSubidaR2({ folder, extension, contentType, contentLength });
  return result.data;
}

async function subirBlob(uploadUrl: string, blob: Blob, contentType: string) {
  let res: Response;
  try {
    res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blob,
    });
  } catch {
    // fetch() solo lanza esto por una falla de RED (sin conexión, CORS
    // bloqueado, etc.) — nunca por un error del servidor. Safari lo
    // muestra como "Load failed", Chrome como "Failed to fetch"; en
    // ambos casos el navegador no llegó a hablar con R2.
    throw new Error(
      "No se pudo conectar con el almacenamiento para subir el archivo. Revisa tu conexión a internet y vuelve a intentar."
    );
  }
  if (!res.ok) {
    throw new Error(`No se pudo subir el archivo a R2 (código ${res.status}). Intenta de nuevo.`);
  }
}

function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const resultado = reader.result as string;
      // El resultado viene como "data:image/webp;base64,AAAA..." — nos
      // quedamos solo con la parte de datos.
      resolve(resultado.slice(resultado.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(blob);
  });
}

/**
 * El avatar NO sube directo a R2 como el resto de archivos — pasa por
 * el servidor (subirAvatarServidor). Es un archivo chico (ya se
 * comprimió a ~320x320 en el navegador antes de llegar acá), así que
 * no pesa subirlo así, y evita depender de que el bucket de R2 tenga
 * CORS configurado para el dominio exacto de la app.
 */
export async function subirAvatarR2(file: File): Promise<SubidaR2> {
  const auth = getAuth(app ?? undefined);
  if (!auth.currentUser) {
    throw new Error("Debes iniciar sesión para subir archivos.");
  }

  const contentType = file.type || "image/webp";
  const dataBase64 = await blobABase64(file);

  const functions = getFunctions(app ?? undefined);
  const subirAvatarServidor = httpsCallable<{ dataBase64: string; contentType: string }, { key: string }>(
    functions,
    "subirAvatarServidor"
  );

  try {
    const { data } = await subirAvatarServidor({ dataBase64, contentType });
    return { key: data.key };
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "No se pudo subir la foto.");
  }
}

/**
 * Sube una foto de reporte (que viene como dataUrl del recortador) y
 * devuelve solo su clave en R2.
 *
 * Antes estas fotos viajaban enteras, en base64, dentro de la llamada a
 * generarReporteCliente. Como una llamada a Cloud Functions no puede pasar
 * de 10 MB y base64 infla el peso un tercio, un reporte con muchos paneles
 * simplemente fallaba. Subiéndolas primero, a la función solo le llegan
 * las claves: unos pocos KB, sin techo práctico de cantidad.
 *
 * No genera miniatura: son temporales, el servidor las borra en cuanto
 * quedan dentro del PDF.
 */
export async function subirFotoReporteR2(dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const contentType = blob.type || "image/jpeg";
  const dataBase64 = await blobABase64(blob);
  const functions = getFunctions(app ?? undefined);
  const subirFotoReporteServidor = httpsCallable<
    { dataBase64: string; contentType: string },
    { key: string }
  >(functions, "subirFotoReporteServidor");
  const { data } = await subirFotoReporteServidor({ dataBase64, contentType });
  return data.key;
}

export async function subirFacturaR2(file: File): Promise<{ key: string }> {
  const auth = getAuth(app ?? undefined);
  if (!auth.currentUser) {
    throw new Error("Debes iniciar sesión para subir facturas.");
  }
  if (file.type !== "application/pdf") {
    throw new Error("Sube un PDF válido.");
  }
  const { key, uploadUrl } = await pedirUrlFirmada("vista360/facturas", "pdf", "application/pdf", file.size);
  await subirBlob(uploadUrl, file, "application/pdf");
  return { key };
}
