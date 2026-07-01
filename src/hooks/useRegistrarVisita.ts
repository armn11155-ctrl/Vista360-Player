import { useEffect, useRef } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../config/firebase";

/**
 * Registra "el cliente vio esta pantalla" cada vez que `pantalla` cambia.
 * Igual que useRegistrarAcceso: fire-and-forget, no bloquea nada si
 * falla. No registra la MISMA pantalla dos veces seguidas (evita spam
 * si algo re-renderiza con el mismo valor de vista).
 */
export function useRegistrarVisita(uid: string | undefined, pantalla: string) {
  const ultimaRegistrada = useRef<string | null>(null);

  useEffect(() => {
    if (!uid || !app) return;
    const key = `${uid}:${pantalla}`;
    if (ultimaRegistrada.current === key) return;
    ultimaRegistrada.current = key;

    const functions = getFunctions(app);
    const registrar = httpsCallable(functions, "registrarVisita");
    registrar({ pantalla }).catch(() => {
      // Silencioso a propósito — ver comentario arriba.
    });
  }, [uid, pantalla]);
}
