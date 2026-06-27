import { useEffect } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../config/firebase";
import { env } from "../config/env";

const INTERVAL_MS = 30_000;

/**
 * Escribe periódicamente en playersStatus/{panelId} para que el admin
 * pueda ver desde Vista360 (ERP) qué pantallas están encendidas y
 * cuándo fue la última vez que se reportaron.
 */
export function useHeartbeat(panelId: string) {
  useEffect(() => {
    if (!panelId || !db) return;

    const ref = doc(db, "playersStatus", panelId);
    const send = (online: boolean) => {
      setDoc(
        ref,
        {
          panel_id: panelId,
          online,
          lastSeen: serverTimestamp(),
          appVersion: env.appVersion,
          userAgent: navigator.userAgent,
        },
        { merge: true }
      ).catch(() => {
        /* sin conexión — se reintenta en el próximo tick */
      });
    };

    send(true);
    const interval = setInterval(() => send(true), INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") send(true);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [panelId]);
}
