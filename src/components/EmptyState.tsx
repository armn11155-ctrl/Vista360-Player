import { useEffect, useState } from "react";

interface Props {
  panelId: string;
  reason: "empty" | "error" | "loading";
}

/**
 * Se muestra cuando todavía no hay playlist asignada, está cargando,
 * o algo falló. Nunca deja la pantalla en negro puro — un reloj grande
 * confirma al instalador que el dispositivo está vivo y conectado,
 * solo esperando contenido.
 */
export default function EmptyState({ panelId, reason }: Props) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const time = now.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const message =
    reason === "loading"
      ? "Conectando…"
      : reason === "error"
      ? "Sin conexión — reintentando…"
      : "Sin contenido asignado todavía";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#07101F",
        color: "#fff",
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div style={{ fontSize: "min(18vw, 160px)", fontWeight: 800, letterSpacing: -2 }}>
        {time}
      </div>
      <div style={{ fontSize: "min(3.2vw, 24px)", color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
        {date}
      </div>
      <div
        style={{
          marginTop: 36,
          padding: "8px 20px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.06)",
          fontSize: 14,
          color: "rgba(255,255,255,0.45)",
        }}
      >
        {message} · Panel {panelId}
      </div>
    </div>
  );
}
