import { useEffect, useRef } from "react";
import { doc, updateDoc, increment, serverTimestamp } from "firebase/firestore";
import { db } from "../config/firebase";

/**
 * Registra "este cliente acaba de entrar" directo en Firestore, sin
 * Cloud Functions ni Blaze. Guarda lastLogin (timestamp) y un contador
 * de accesos totales en portalUsers/{uid}.
 * Fire-and-forget: si falla no interrumpe nada.
 */
export function useRegistrarAcceso(uid: string | undefined) {
  const yaRegistrado = useRef<string | null>(null);

  useEffect(() => {
    if (!uid || !db) return;
    if (yaRegistrado.current === uid) return;
    yaRegistrado.current = uid;

    updateDoc(doc(db, "portalUsers", uid), {
      lastLogin: serverTimestamp(),
      lastLoginCount: increment(1),
    }).catch(() => {
      // Silencioso — es solo analytics, no bloquea nada
    });
  }, [uid]);
}
