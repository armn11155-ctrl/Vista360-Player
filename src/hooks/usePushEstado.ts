import { useEffect, useState } from "react";
import { activarNotificacionesPush, estadoPermisoNotificaciones, pushDisponible } from "../utils/pushNotifications";

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
 */
export function usePushEstado() {
  const [estado, setEstado] = useState<EstadoPush>("oculto");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelado = false;
    const permiso = estadoPermisoNotificaciones();
    if (permiso === "granted") { setEstado("activado"); return; }
    if (permiso === "denied") { setEstado("bloqueado"); return; }
    pushDisponible().then((disponible) => {
      if (!cancelado && disponible) setEstado("ofrecer");
    });
    return () => { cancelado = true; };
  }, []);

  async function activar(uid?: string) {
    if (!uid) return;
    setEstado("activando");
    setError("");
    const res = await activarNotificacionesPush(uid);
    if (res.ok) {
      setEstado("activado");
    } else {
      setEstado("error");
      setError(res.error);
    }
  }

  return { estado, error, activar };
}
