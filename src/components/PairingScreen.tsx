import { useState } from "react";

interface Props {
  onPaired: (panelId: string) => void;
}

/**
 * Pantalla de primer arranque: el instalador escribe el ID del panel
 * (el mismo "id" que aparece en Vista360 → Paneles) una sola vez.
 * Se guarda en localStorage del dispositivo — no se vuelve a pedir
 * a menos que se borre el caché del navegador o se reinicie el equipo
 * de fábrica.
 *
 * El click de "Conectar" también nos da el gesto de usuario que los
 * navegadores exigen para poder entrar a pantalla completa.
 */
export default function PairingScreen({ onPaired }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  function submit() {
    const id = value.trim();
    if (!id) {
      setError("Escribe el ID del panel (lo ves en Vista360 → Paneles).");
      return;
    }
    document.documentElement
      .requestFullscreen?.()
      .catch(() => {
        /* algunos navegadores/TVs no lo permiten — seguimos igual */
      });
    onPaired(id);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(160deg,#07101F 0%,#0D1A35 55%,#0A2060 100%)",
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
        cursor: "auto",
      }}
    >
      <div
        style={{
          width: "min(420px, 90vw)",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16,
          padding: "40px 32px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", marginBottom: 6 }}>
          Vista360 Player
        </div>
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, marginBottom: 28 }}>
          Configura este dispositivo escribiendo el ID del panel asignado.
        </p>
        <input
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="ID del panel, ej: panel-001"
          style={{
            width: "100%",
            padding: "14px 16px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.06)",
            color: "#fff",
            fontSize: 16,
            outline: "none",
            marginBottom: 14,
            textAlign: "center",
          }}
        />
        {error && (
          <div style={{ color: "#fca5a5", fontSize: 13, marginBottom: 14 }}>{error}</div>
        )}
        <button
          onClick={submit}
          style={{
            width: "100%",
            padding: "14px 16px",
            borderRadius: 10,
            border: "none",
            background: "#2563eb",
            color: "#fff",
            fontSize: 16,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Conectar
        </button>
      </div>
    </div>
  );
}
