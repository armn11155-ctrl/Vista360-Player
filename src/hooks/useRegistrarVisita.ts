import { useEffect, useRef } from "react";
import { doc, updateDoc, increment, serverTimestamp } from "firebase/firestore";
import { db } from "../config/firebase";

const PANTALLAS_VALIDAS = new Set([
  "inicio", "campanas", "detalle", "evidencias", "reportes",
  "perfil", "nueva", "portafolio", "cobertura", "mispantallas",
  "impacto", "contactanos", "analitica",
]);

/**
 * Registra qué pantalla visitó el cliente, directo en Firestore.
 * No registra la misma pantalla dos veces seguidas.
 */
export function useRegistrarVisita(uid: string | undefined, pantalla: string) {
  const ultimaRegistrada = useRef<string | null>(null);

  useEffect(() => {
    if (!uid || !db) return;
    if (!PANTALLAS_VALIDAS.has(pantalla)) return;
    const key = `${uid}:${pantalla}`;
    if (ultimaRegistrada.current === key) return;
    ultimaRegistrada.current = key;

    updateDoc(doc(db, "portalUsers", uid), {
      [`pantallasVisitadas.${pantalla}.count`]: increment(1),
      [`pantallasVisitadas.${pantalla}.lastVisit`]: serverTimestamp(),
    }).catch(() => {
      // Silencioso — es solo analytics
    });
  }, [uid, pantalla]);
}
