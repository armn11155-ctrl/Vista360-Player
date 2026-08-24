/**
 * Detección liviana de dispositivo/navegador -- solo para elegir qué
 * texto de ayuda mostrar cuando el permiso de notificaciones quedó
 * bloqueado (los pasos para desbloquearlo son distintos en un celular
 * -- Ajustes del sistema -- que en una compu -- ajustes del propio
 * navegador). No se usa para nada más (ni analítica, ni bloquear
 * funciones), así que un chequeo simple por userAgent alcanza.
 */

export function esMovil(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export type NavegadorEscritorio = "chrome" | "edge" | "firefox" | "safari" | "otro";

export function navegadorEscritorio(): NavegadorEscritorio {
  if (typeof navigator === "undefined") return "otro";
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "edge";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Chrome\//.test(ua) || /Chromium\//.test(ua)) return "chrome";
  if (/Safari\//.test(ua)) return "safari";
  return "otro";
}

/** Pasos breves para recuperar un permiso bloqueado en una laptop. */
export function pasosDesbloqueoNotificacionesEscritorio(): string[] {
  const navegador = navegadorEscritorio();
  if (navegador === "safari") {
    return [
      "Abre Safari > Ajustes > Sitios web.",
      "Entra a Notificaciones, busca este sitio y elige Permitir.",
      "Vuelve a esta pestaña; Vista360 lo detectará automáticamente.",
    ];
  }
  if (navegador === "firefox") {
    return [
      "Haz clic en el candado junto a la dirección.",
      "Abre Más información > Permisos y permite Notificaciones.",
      "Vuelve a esta pestaña; Vista360 lo detectará automáticamente.",
    ];
  }
  return [
    "Haz clic en el candado o ícono junto a la dirección.",
    "Cambia Notificaciones a Permitir.",
    "Vuelve a esta pestaña; Vista360 lo detectará automáticamente.",
  ];
}
