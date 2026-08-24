import { useEffect, useState } from "react";
import { activarNotificacionesPush, diagnosticoPush, estadoPermisoNotificaciones, pushDisponible, yaRegistradoEnEsteNavegador } from "../utils/pushNotifications";

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
  const [revisionPermiso, setRevisionPermiso] = useState(0);

  useEffect(() => {
    let cancelado = false;
    const permiso = estadoPermisoNotificaciones();
    if (permiso === "granted") {
      if (!uid || yaRegistradoEnEsteNavegador(uid)) {
        setError("");
        setEstado("activado");
        return () => { cancelado = true; };
      }

      // El permiso por sí solo no garantiza que exista un token válido.
      // Primero se reconfirma silenciosamente con Firebase y recién
      // después se pinta la campana como activa.
      setError("");
      setEstado("activando");
      void activarNotificacionesPush(uid, { confirmar: false }).then((res) => {
        if (cancelado) return;
        if (res.ok) {
          setEstado("activado");
        } else if (estadoPermisoNotificaciones() === "denied") {
          setError(res.error);
          setEstado("bloqueado");
        } else {
          setError(res.error);
          setEstado("error");
        }
      });
      return () => { cancelado = true; };
    }
    if (permiso === "denied") {
      setEstado("bloqueado");
      setError("El navegador bloqueó las notificaciones para este sitio.");
      return () => { cancelado = true; };
    }
    pushDisponible().then((disponible) => {
      if (cancelado) return;
      if (disponible) {
        setError("");
        setEstado("ofrecer");
      } else {
        void diagnosticoPush().then((d) => { if (!cancelado) setDiagnostico(d); });
      }
    });
    return () => { cancelado = true; };
  }, [uid, revisionPermiso]);

  // El permiso de Notification es por SITIO, así que si la persona lo
  // cambia desde AFUERA de la app (ajustes del navegador o del
  // sistema -- ej. desbloquear notificaciones para desbloquear el
  // estado "bloqueado") y luego vuelve a esta pestaña, el estado de
  // acá se queda pegado con el valor viejo hasta que se recargue toda
  // la página. Con esto se vuelve a leer Notification.permission apenas
  // la pestaña vuelve a estar visible o recupera el foco, así se
  // refleja el cambio sin necesitar un F5.
  useEffect(() => {
    function revisarAlVolver() {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      setRevisionPermiso((n) => n + 1);
    }
    document.addEventListener("visibilitychange", revisarAlVolver);
    window.addEventListener("focus", revisarAlVolver);
    return () => {
      document.removeEventListener("visibilitychange", revisarAlVolver);
      window.removeEventListener("focus", revisarAlVolver);
    };
  }, []);

  // El menú de permisos del candado/ícono de Safari o Chrome puede
  // abrirse sin que la pestaña pierda el foco. En ese caso no llega
  // ningún evento al volver y el antiguo estado "bloqueado" quedaba
  // pegado hasta recargar. Mientras esté bloqueado se consulta la
  // propiedad local (sin red) y se reevalúa apenas cambie.
  useEffect(() => {
    if (estado !== "bloqueado") return;
    const id = window.setInterval(() => {
      if (estadoPermisoNotificaciones() !== "denied") {
        setRevisionPermiso((n) => n + 1);
      }
    }, 1_200);
    return () => window.clearInterval(id);
  }, [estado]);

  async function activar(uidParam?: string) {
    if (!uidParam) return;
    setEstado("activando");
    setError("");
    const res = await activarNotificacionesPush(uidParam, { confirmar: true });
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
