import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import type { ContenidoDigital } from "../types";

export type PlaylistState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; contenido: ContenidoDigital }
  | { status: "error"; message: string };

/**
 * Se suscribe en tiempo real al documento contenidoDigital/{panelId}.
 * Cuando alguien actualiza la playlist desde Firestore, el panel la
 * recibe y la aplica sin necesidad de reiniciar ni recargar la página.
 */
export function usePlaylist(panelId: string): PlaylistState {
  const [state, setState] = useState<PlaylistState>({ status: "loading" });

  useEffect(() => {
    if (!panelId) {
      setState({ status: "empty" });
      return;
    }
    if (!db) {
      setState({ status: "error", message: "Firebase no configurado" });
      return;
    }
    const ref = doc(db, "contenidoDigital", panelId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setState({ status: "empty" });
          return;
        }
        const data = snap.data() as Omit<ContenidoDigital, "id">;
        if (!data.activo || !data.items || data.items.length === 0) {
          setState({ status: "empty" });
          return;
        }
        const items = [...data.items].sort((a, b) => a.orden - b.orden);
        setState({ status: "ready", contenido: { id: snap.id, ...data, items } });
      },
      (err) => {
        setState({ status: "error", message: err.message });
      }
    );
    return unsub;
  }, [panelId]);

  return state;
}
