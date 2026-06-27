import { useEffect, useState } from "react";
import { ensureSignedIn } from "./config/firebase";
import { usePlaylist } from "./hooks/usePlaylist";
import { useHeartbeat } from "./hooks/useHeartbeat";
import { useWakeLock } from "./hooks/useWakeLock";
import PairingScreen from "./components/PairingScreen";
import EmptyState from "./components/EmptyState";
import Player from "./components/Player";

const STORAGE_KEY = "vista360player.panelId";

export default function App() {
  const [panelId, setPanelId] = useState<string>(() => localStorage.getItem(STORAGE_KEY) ?? "");
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState(false);

  useWakeLock();

  useEffect(() => {
    if (!panelId) return;
    let cancelled = false;
    ensureSignedIn()
      .then(() => {
        if (!cancelled) setAuthReady(true);
      })
      .catch(() => {
        if (!cancelled) setAuthError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [panelId]);

  useHeartbeat(authReady ? panelId : "");

  const playlist = usePlaylist(authReady ? panelId : "");

  function handlePaired(id: string) {
    localStorage.setItem(STORAGE_KEY, id);
    setPanelId(id);
  }

  if (!panelId) {
    return <PairingScreen onPaired={handlePaired} />;
  }

  if (authError) {
    return <EmptyState panelId={panelId} reason="error" />;
  }

  if (!authReady || playlist.status === "loading") {
    return <EmptyState panelId={panelId} reason="loading" />;
  }

  if (playlist.status === "ready") {
    // key distinta cuando cambia el contenido o se actualiza →
    // el Player remonta limpio en vez de mutar una playlist vieja.
    const key = `${playlist.contenido.id}-${playlist.contenido.updatedAt?.toMillis?.() ?? 0}`;
    return <Player key={key} contenido={playlist.contenido} />;
  }

  return <EmptyState panelId={panelId} reason={playlist.status === "error" ? "error" : "empty"} />;
}
