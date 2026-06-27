import { useEffect } from "react";

/**
 * Pide al sistema que no apague la pantalla mientras el player está
 * activo. Soportado en Chrome/Android — en navegadores sin soporte
 * simplemente no hace nada (no rompe el player).
 */
export function useWakeLock() {
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sentinel: any = null;
    let cancelled = false;

    async function request() {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nav = navigator as any;
        if (nav.wakeLock) {
          sentinel = await nav.wakeLock.request("screen");
        }
      } catch {
        /* permiso denegado o no soportado — no es crítico */
      }
    }

    if (!cancelled) request();

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !sentinel) request();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      sentinel?.release?.().catch(() => {});
    };
  }, []);
}
