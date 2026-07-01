import { useEffect, useState } from "react";

/**
 * Detecta si el dispositivo tiene conexión a internet, usando los eventos
 * nativos del navegador (online/offline) + el estado inicial de
 * navigator.onLine. No detecta "WiFi conectado pero sin internet real"
 * (eso requeriría pings periódicos), pero cubre el caso más común: el
 * cliente entra a un túnel, pierde señal, o pone el celular en modo avión.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
