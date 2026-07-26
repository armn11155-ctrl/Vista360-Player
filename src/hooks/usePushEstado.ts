import { useEffect, useState } from "react";
import { activarNotificacionesPush, diagnosticoPush, estadoPermisoNotificaciones, pushDisponible } from "../utils/pushNotifications";

export type EstadoPush = "oculto" | "ofrecer" | "activando" | "activado" | "error" | "bloqueado";

/**
 * Estado de las notificaciones push, compartido entre todos los lugares
 * que necesitan mostrar/activar esto (antes vivía duplicado dentro de
 * Notificaciones.tsx -- ahora también lo usan el botón de la campanita
 * en Inicio y el aviso de bienvenida NotifPrompt).
 *
 * "ofrecer" = el navegador soporta push y todavía no se le preguntó
 * permiso (ni sí ni no) -- es el único estado en el que tiene sentido
 * mostrar un botón/aviso para activar.
 *
 * uid (opcional): el permiso del navegador (Notification.permission)
 * es por SITIO, no por cuenta -- si en este mismo celular/navegador
 * ya se había aceptado antes (con OTRA cuenta de cliente), una cuenta
 * nueva que entra ahí ve directo la campanita normal, porque el
 * navegador ya tiene el permiso resuelto y no vuelve a preguntar. El
 * problema es que esa cuenta nueva todavía NO tiene su propio token
 * FCM guardado en portalUsers -- sin esto, aunque el navegador diga
 * "granted", esta cuenta en particular nunca iba a recibir push. Por
 * eso, si se pasa el uid, se registra el token en SILENCIO (sin pedir
 * permiso de nuevo -- el navegador ya lo tiene resuelto, esto solo
 * hace el paso de getToken()+guardarlo) apenas se detecta que el
 * permiso ya estaba concedido.
 */
export function usePushEstado(uid?: string) {
  const [estado, setEstado] = useState<EstadoPush>("oculto");
  const [error, setError] = useState("");
  const [diagnostico, setDiagnostico] = useState("");

  useEffect(() => {
    const permiso = estadoPermisoNotificaciones();
    if (permiso === "granted") {
      setEstado("activado");
      if (uid) void activarNotificacionesPush(uid);
      return;
    }
    if (permiso === "denied") { setEstado("bloqueado"); return; }
    let cancelado = false;
    pushDisponible().then((disponible) => {
      if (cancelado) return;
      if (disponible) {
        setEstado("ofrecer");
      } else {
        void diagnosticoPush().then((d) => { if (!cancelado) setDiagnostico(d); });
      }
    });
    return () => { cancelado = true; };
  }, [uid]);

  async function activar(uidParam?: string) {
    if (!uidParam) return;
    setEstado("activando");
    setError("");
    const res = await activarNotificacionesPush(uidParam);
    if (res.ok) {
      setEstado("activado");
    } else if (estadoPermisoNotificaciones() === "denied") {
      // El navegador quedó en "denied" justo en ESTE intento (le dio
      // "No permitir" recién) -- esto es distinto de un error técnico
      // (getToken falló, red, etc.): acá el navegador SÍ preguntó y la
      // persona SÍ eligió no permitir. Tiene que quedar igual de
      // bloqueado que si ya lo hubiera rechazado antes -- antes esto
      // caía en "error", que sí se cerraba solo y dejaba entrar a la
      // app sin haber aceptado nunca.
      setEstado("bloqueado");
      setError(res.error);
    } else {
      setEstado("error");
      setError(res.error);
    }
  }

  return { estado, error, activar, diagnostico };
}
