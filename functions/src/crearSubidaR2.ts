import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { MAX_SUBIDA_BYTES, R2_SECRETS, esCarpetaValida, firmarSubidaR2, nuevaKey } from "./r2Storage.js";
import { esPersonalInterno } from "./rolesInternos.js";
import { exigirRitmo } from "./limitador.js";

if (getApps().length === 0) {
  initializeApp();
}

const TIPOS_PERMITIDOS = new Set([
  "image/webp",
  "image/jpeg",
  "image/png",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
]);

/**
 * Reemplaza a getCloudinarySignature: cualquier usuario del portal
 * (cliente o admin) autenticado pide "quiero subir un archivo de tal
 * tipo a tal carpeta" — por ejemplo un cliente adjuntando una imagen
 * de referencia al pedir una campaña nueva — y esta función devuelve
 * una URL de R2 pre-firmada (PUT) que expira en 10 minutos. El
 * navegador sube el archivo directo a R2 con esa URL. La acción
 * sensible (asignar esa foto a una campaña real) sigue exigiendo rol
 * admin en actualizarImagenCampania.
 */
export const crearSubidaR2 = onCall({ secrets: R2_SECRETS }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  // Techo de peticiones por minuto: ver limitador.ts.
  exigirRitmo(uid, "crearSubidaR2", 60);

  const db = getFirestore();
  const snap = await db.doc(`portalUsers/${uid}`).get();
  if (!snap.exists) {
    throw new HttpsError("permission-denied", "Tu cuenta no está vinculada al portal.");
  }
  // SOLO PERSONAL INTERNO. Antes bastaba con tener ficha de portal, o
  // sea que cualquier cliente podía pedir una URL de subida llamando a
  // esta función desde la consola del navegador -- aunque la aplicación
  // no le ofrezca ninguna forma de subir archivos.
  //
  // No permitía sobrescribir nada (la clave la genera el servidor con
  // una parte aleatoria) ni leer lo ajeno (eso lo cubre firmarUrlsR2),
  // así que no era una fuga de datos: era espacio y coste de
  // almacenamiento a cuenta de Vista360, y archivos ajenos metidos en
  // las carpetas del negocio.
  //
  // En la aplicación esto solo lo usan Reportes (fotos de evidencia) y
  // Facturas (PDF), las dos pantallas de administración. El avatar del
  // cliente NO pasa por acá: va por subirAvatarServidor, que sí debe
  // seguir abierto a cualquier cuenta para su propia foto.
  if (!esPersonalInterno(snap.data()?.role)) {
    throw new HttpsError("permission-denied", "Solo el equipo interno puede subir archivos.");
  }

  const folder = String(request.data?.folder ?? "");
  const extension = String(request.data?.extension ?? "");
  const contentType = String(request.data?.contentType ?? "");

  if (!esCarpetaValida(folder)) {
    throw new HttpsError("invalid-argument", "Carpeta de destino inválida.");
  }
  if (!TIPOS_PERMITIDOS.has(contentType)) {
    throw new HttpsError("invalid-argument", "Tipo de archivo no permitido.");
  }

  // Tamaño: se valida acá y además se mete DENTRO de la firma. Sin esto,
  // la URL firmada servía para subir un archivo de cualquier peso -- y se
  // puede usar fuera de la app, así que el límite del navegador no contaba.
  const contentLength = Number(request.data?.contentLength ?? 0);
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    throw new HttpsError("invalid-argument", "Falta el tamaño del archivo.");
  }
  if (contentLength > MAX_SUBIDA_BYTES) {
    const mb = Math.round(MAX_SUBIDA_BYTES / 1024 / 1024);
    throw new HttpsError("invalid-argument", `El archivo supera el máximo de ${mb} MB.`);
  }

  const key = nuevaKey(folder, extension);
  const uploadUrl = await firmarSubidaR2(key, contentType, 600, contentLength);

  return { key, uploadUrl };
});
