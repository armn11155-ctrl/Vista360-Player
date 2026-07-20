import { arrayUnion, doc, updateDoc } from "firebase/firestore";
import { app, db } from "../config/firebase";
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

export async function activarNotificacionesPush(uid: string): Promise<ActivarPushResultado> {
  if (!app) return { ok: false, error: "Firebase no está configurado." };
  if (!env.vapidKey) return { ok: false, error: "Las notificaciones push aún no están configuradas." };

  const soportado = await pushDisponible();
  if (!soportado) return { ok: false, error: "Tu navegador no soporta notificaciones push." };

  try {
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") {
      return { ok: false, error: "No diste permiso para las notificaciones." };
    }

    const registro = await navigator.serviceWorker.ready;
    const { getMessaging, getToken } = await import("firebase/messaging");
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: env.vapidKey, serviceWorkerRegistration: registro });
    if (!token) {
      return { ok: false, error: "No se pudo generar el token de notificaciones." };
    }

    if (db) {
      await updateDoc(doc(db, "portalUsers", uid), { fcmTokens: arrayUnion(token) });
    }
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
