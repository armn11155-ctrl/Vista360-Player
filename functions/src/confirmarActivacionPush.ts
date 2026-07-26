import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (getApps().length === 0) {
  initializeApp();
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
 * A propósito manda solo a los tokens de ESTA cuenta (portalUsers/uid),
 * no a todos los que compartan el mismo cliente_id -- si un cliente
 * tiene el portal abierto en dos celulares, activar en uno no debería
 * mandarle un push de "activaste" al otro que ya lo tenía activado.
 */
export const confirmarActivacionPush = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

  const db = getFirestore();
  const snap = await db.doc(`portalUsers/${uid}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "Cuenta no encontrada.");

  const tokens: string[] = Array.isArray(snap.data()?.fcmTokens)
    ? snap.data()!.fcmTokens.filter((t: unknown) => typeof t === "string" && t)
    : [];
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
