import { httpsCallable } from "firebase/functions";
import { app, cloudFunctions } from "../config/firebase";
import { env } from "../config/env";

export type ActivarPushResultado = { ok: true } | { ok: false; error: string };

/**
 * Notificaciones push (Firebase Cloud Messaging) -- avisan al cliente
 * aunque no tenga la app abierta (campaña por vencer, reporte nuevo,
 * factura nueva). Antes de esto, lo único que existía era la
 * campanita DENTRO de la app: si el cliente no entraba, nunca se
 * enteraba de nada.
 *
 * Todo lo de acá es opcional a propósito: si falta la VAPID key (se
 * genera a mano en Firebase Console) o el navegador no soporta push,
 * simplemente no se ofrece la opción -- el resto de la app sigue
 * funcionando igual.
 */

let soportadoCache: Promise<boolean> | null = null;

export function pushDisponible(): Promise<boolean> {
  if (!app || !env.vapidKey) return Promise.resolve(false);
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("Notification" in window)) {
    return Promise.resolve(false);
  }
  if (!soportadoCache) {
    soportadoCache = import("firebase/messaging")
      .then(({ isSupported }) => isSupported())
      .catch(() => false);
  }
  return soportadoCache;
}

const CLAVE_TOKEN_REGISTRADO = "vista360_push_token_registrado";

/** true si YA se registró el token de push para esta cuenta en este
 *  mismo navegador -- evita repetir el registro (y el push de
 *  confirmación "Notificaciones activadas") en cada re-montaje del
 *  componente. Esto pasaba, por ejemplo, en modo administrador: cada
 *  vez que se entraba a ver un cliente distinto, el árbol de
 *  componentes se volvía a montar, así que el registro "silencioso"
 *  (permiso ya concedido de antes) se repetía de cero y mandaba el
 *  push de bienvenida una y otra vez, aunque ya estuviera todo
 *  activado hace rato. */
export function yaRegistradoEnEsteNavegador(uid: string): boolean {
  try {
    return localStorage.getItem(`${CLAVE_TOKEN_REGISTRADO}:${uid}`) === "1";
  } catch {
    return false;
  }
}

function marcarRegistradoEnEsteNavegador(uid: string) {
  try {
    localStorage.setItem(`${CLAVE_TOKEN_REGISTRADO}:${uid}`, "1");
  } catch {
    // sin problema si no se pudo guardar -- en el peor caso se repite
  }
}

export async function activarNotificacionesPush(uid: string): Promise<ActivarPushResultado> {
  if (!app) return { ok: false, error: "Firebase no está configurado." };
  if (!env.vapidKey) return { ok: false, error: "Las notificaciones push aún no están configuradas." };

  try {
    // Safari/macOS exige que requestPermission ocurra pegado al gesto del
    // usuario. Antes había un `await pushDisponible()` primero; aunque la
    // comprobación fuese rápida, Safari podía perder la activación del clic
    // y convertir el segundo intento en denegado. Las comprobaciones
    // síncronas ya se hicieron arriba, así que se pide permiso de inmediato
    // y nunca se vuelve a preguntar si ya estaba concedido.
    const permisoActual = estadoPermisoNotificaciones();
    const permiso = permisoActual === "granted"
      ? permisoActual
      : permisoActual === "default"
        ? await Notification.requestPermission()
        : permisoActual;
    if (permiso !== "granted") {
      return { ok: false, error: "No diste permiso para las notificaciones." };
    }

    const soportado = await pushDisponible();
    if (!soportado) return { ok: false, error: "Tu navegador no soporta notificaciones push." };

    const registro = await navigator.serviceWorker.ready;
    const { getMessaging, getToken } = await import("firebase/messaging");
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: env.vapidKey, serviceWorkerRegistration: registro });
    if (!token) {
      return { ok: false, error: "No se pudo generar el token de notificaciones." };
    }

    // Guardar el token vía Cloud Function (Admin SDK), NO con una
    // escritura directa de Firestore -- esa escritura directa fallaba
    // con "Missing or insufficient permissions" porque las reglas de
    // seguridad (fuera de este repo, en la consola de Firebase) no
    // dejan a una cuenta de portal escribir su propio documento. Mismo
    // problema ya documentado y resuelto igual en otras partes de este
    // proyecto (ver administrarClienteAdmin.ts).
    if (cloudFunctions) {
      const guardarToken = httpsCallable<{ token: string }, { ok: boolean }>(cloudFunctions, "guardarTokenPush");
      await guardarToken({ token });
    }

    // Confirmación de que quedó activado, mandada como push de verdad
    // (no solo texto en pantalla) -- prueba que todo el camino
    // funciona de punta a punta. Si falla (red, etc.) no revierte la
    // activación -- el token ya quedó guardado, solo no llegó el
    // aviso de bienvenida esta vez.
    if (cloudFunctions) {
      // Le pasa el token de ESTE dispositivo -- sin esto, la Cloud
      // Function no sabe cuál es "el que se acaba de activar" y termina
      // mandando la confirmación a TODOS los dispositivos de la cuenta
      // (ver el comentario largo en confirmarActivacionPush.ts).
      const confirmar = httpsCallable<{ token: string }, { ok: boolean }>(cloudFunctions, "confirmarActivacionPush");
      void confirmar({ token }).catch(() => undefined);
    }

    marcarRegistradoEnEsteNavegador(uid);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo activar las notificaciones." };
  }
}

/** true si el navegador ya bloqueó/dio permiso antes -- para no
 *  mostrar el botón de activar si ya no tiene caso (bloqueado) o si
 *  ya está activado. */
export function estadoPermisoNotificaciones(): NotificationPermission | "no-soportado" {
  if (typeof window === "undefined" || !("Notification" in window)) return "no-soportado";
  return Notification.permission;
}

/**
 * Diagnóstico legible de por qué el botón de activar notificaciones
 * no aparece en un dispositivo -- pensado para que un cliente pueda
 * mandar un pantallazo de esto y se pueda saber al toque cuál de los
 * requisitos está fallando, sin acceso al celular real.
 */
export async function diagnosticoPush(): Promise<string> {
  const partes: string[] = [];
  partes.push(`app=${app ? "sí" : "NO"}`);
  partes.push(`vapid=${env.vapidKey ? "sí" : "NO"}`);
  const notifSoportada = typeof window !== "undefined" && "Notification" in window;
  partes.push(`notification=${notifSoportada ? "sí" : "NO"}`);
  const swSoportado = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  partes.push(`serviceWorker=${swSoportado ? "sí" : "NO"}`);
  partes.push(`permiso=${estadoPermisoNotificaciones()}`);
  let fcm = "no-evaluado";
  if (app && notifSoportada && swSoportado) {
    try {
      const { isSupported } = await import("firebase/messaging");
      fcm = (await isSupported()) ? "sí" : "NO";
    } catch {
      fcm = "error";
    }
  }
  partes.push(`fcmSoportado=${fcm}`);
  return partes.join(" · ");
}
