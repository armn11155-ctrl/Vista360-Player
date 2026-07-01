import { useEffect, useRef } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../config/firebase";

/**
 * Llama a la Cloud Function registrarAcceso una sola vez, apenas el
 * usuario queda autenticado (uid presente). Es "fire and forget": si
 * falla (sin internet, función no desplegada aún, etc.) no interrumpe
 * nada — es solo un dato para la pantalla de Analítica, no algo de lo
 * que dependa el resto de la app.
 */
export function useRegistrarAcceso(uid: string | undefined) {
  const yaRegistrado = useRef<string | null>(null);

  useEffect(() => {
    if (!uid || !app) return;
    if (yaRegistrado.current === uid) return;
    yaRegistrado.current = uid;

    const functions = getFunctions(app);
    const registrar = httpsCallable(functions, "registrarAcceso");
    registrar().catch(() => {
      // Silencioso a propósito — ver comentario arriba.
    });
  }, [uid]);
}
