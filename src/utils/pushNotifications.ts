import { httpsCallable } from "firebase/functions";
import { app, cloudFunctions } from "../config/firebase";
import { env } from "../config/env";

export type ActivarPushResultado = { ok: true } | { ok: false; error: string };

interface ActivarPushOpciones {
  /** La confirmación se manda únicamente cuando la persona acaba de
   *  activar el permiso. Las renovaciones silenciosas del token no deben
   *  generar una notificación nueva cada semana. */
  confirmar?: boolean;
}

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
const VIGENCIA_REGISTRO_MS = 7 * 24 * 60 * 60 * 1000;
const activacionesEnCurso = new Map<string, Promise<ActivarPushResultado>>();

/** true si el token se confirmó recientemente para esta cuenta en este
 *  navegador. Antes se guardaba el texto "1" para siempre: si Firebase
 *  rotaba el token o el servidor retiraba uno inválido, la app nunca lo
 *  registraba de nuevo y aun así mostraba la campana como activa. */
export function yaRegistradoEnEsteNavegador(uid: string): boolean {
  try {
    const registradoEn = Number(localStorage.getItem(`${CLAVE_TOKEN_REGISTRADO}:${uid}`));
    const ahora = Date.now();
    return Number.isFinite(registradoEn)
      && registradoEn > 0
      && registradoEn <= ahora + 5 * 60 * 1000
      && ahora - registradoEn < VIGENCIA_REGISTRO_MS;
  } catch {
    return false;
  }
}

function marcarRegistradoEnEsteNavegador(uid: string) {
  try {
    localStorage.setItem(`${CLAVE_TOKEN_REGISTRADO}:${uid}`, String(Date.now()));
  } catch {
    // sin problema si no se pudo guardar -- en el peor caso se repite
  }
}

function esperarServiceWorker(): Promise<ServiceWorkerRegistration> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("El servicio de notificaciones no terminó de iniciar. Recarga la página e inténtalo otra vez."));
    }, 12_000);
    navigator.serviceWorker.ready.then(
      (registro) => {
        window.clearTimeout(timeout);
        resolve(registro);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

async function activarNotificacionesPushInterno(uid: string, opciones: ActivarPushOpciones): Promise<ActivarPushResultado> {
  if (!app) return { ok: false, error: "Firebase no está configurado." };
  if (!cloudFunctions) return { ok: false, error: "El servicio de notificaciones no está disponible." };
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

    const registro = await esperarServiceWorker();
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
    const guardarToken = httpsCallable<{ token: string }, { ok: boolean }>(cloudFunctions, "guardarTokenPush");
    await guardarToken({ token });

    // Confirmación de que quedó activado, mandada como push de verdad
    // (no solo texto en pantalla) -- prueba que todo el camino
    // funciona de punta a punta. Si falla (red, etc.) no revierte la
    // activación -- el token ya quedó guardado, solo no llegó el
    // aviso de bienvenida esta vez.
    if (opciones.confirmar) {
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
    const mensaje = err instanceof Error ? err.message : "";
    if (/permission[-_ ]?blocked|permission[-_ ]?denied|notifications?.*blocked/i.test(mensaje)) {
      return { ok: false, error: "El navegador todavía tiene bloqueadas las notificaciones para este sitio." };
    }
    return { ok: false, error: mensaje || "No se pudo activar las notificaciones." };
  }
}

/** Activa o renueva el registro push. Las dos instancias del hook que
 *  conviven en Inicio y App comparten la misma promesa: así nunca hacen
 *  dos escrituras ni dos solicitudes de token al mismo tiempo. */
export function activarNotificacionesPush(uid: string, opciones: ActivarPushOpciones = {}): Promise<ActivarPushResultado> {
  const existente = activacionesEnCurso.get(uid);
  if (existente) return existente;

  const tarea = activarNotificacionesPushInterno(uid, opciones).finally(() => {
    if (activacionesEnCurso.get(uid) === tarea) activacionesEnCurso.delete(uid);
  });
  activacionesEnCurso.set(uid, tarea);
  return tarea;
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
