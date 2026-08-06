import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { exigirRitmo } from "./limitador.js";

if (getApps().length === 0) {
  initializeApp();
}

interface ConfirmarActivacionPushData {
  /** El token FCM recién guardado por ESTE dispositivo (ver
   *  activarNotificacionesPush en pushNotifications.ts). */
  token?: string;
}

/**
 * Se llama una sola vez, justo después de que activarNotificacionesPush
 * (frontend) terminó de guardar el token FCM nuevo -- manda un push de
 * verdad (no solo un mensaje en pantalla) a ESE token en particular,
 * para confirmar que todo el camino funciona de punta a punta: token
 * guardado -> Cloud Function -> FCM -> notificación real en el
 * dispositivo. Pedido explícito: la confirmación de "se activó
 * correctamente" tiene que llegar como notificación push, no solo como
 * texto dentro de la app.
 *
 * A propósito manda SOLO al token que se acaba de activar, no a todos
 * los guardados en portalUsers/uid.fcmTokens -- si una cuenta tiene el
 * portal abierto en el celular Y la laptop, activar en una no debería
 * mandarle un push de "activaste" a la otra que ya lo tenía activado
 * de antes. (Antes SÍ mandaba a todos los tokens de la cuenta -- este
 * era justo el bug: activar en la laptop mandaba la confirmación
 * también al celular.)
 */
export const confirmarActivacionPush = onCall<ConfirmarActivacionPushData>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

  // Lee el documento del usuario en cada llamada: sin tope, un bucle
  // desde la consola quema la cuota de LECTURAS igual que las otras la de
  // escrituras. Techo de peticiones por minuto: ver limitador.ts.
  exigirRitmo(uid, "confirmarActivacionPush", 10);

  const tokenNuevo = String(request.data?.token ?? "").trim();

  const db = getFirestore();
  const snap = await db.doc(`portalUsers/${uid}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "Cuenta no encontrada.");

  const tokensGuardados: string[] = Array.isArray(snap.data()?.fcmTokens)
    ? snap.data()!.fcmTokens.filter((t: unknown) => typeof t === "string" && t)
    : [];

  // Si el frontend mandó el token nuevo Y de verdad está guardado en la
  // cuenta, se manda SOLO a ese. Si no (llamadas viejas sin el dato, o
  // el token todavía no propagó), se cae al comportamiento anterior
  // como respaldo -- mejor mandar de más una vez que dejar a alguien
  // sin su confirmación.
  const tokens = tokenNuevo && tokensGuardados.includes(tokenNuevo) ? [tokenNuevo] : tokensGuardados;
  if (tokens.length === 0) return { ok: false };

  try {
    await getMessaging().sendEachForMulticast({
      tokens,
      notification: {
        title: "Notificaciones activadas",
        body: "Perfecto, desde ahora te avisamos apenas tengas un reporte nuevo, una campaña por vencer o una factura.",
      },
      data: { url: "/" },
      webpush: {
        fcmOptions: { link: "/" },
        notification: { icon: "/icon-192.png" },
      },
    });
  } catch {
    // Si falla el envío (token recién creado todavía no propagado, error
    // de red, etc.) no rompe el flujo de activación -- ya quedó activado
    // igual, solo no llegó la confirmación push esta vez.
    return { ok: false };
  }

  return { ok: true };
});
