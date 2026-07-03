import { useState } from "react";

const PASOS = [
  {
    emoji: "👋",
    titulo: "¡Bienvenido a Vista360!",
    texto: "Aquí vas a poder ver tus campañas, tus facturas y hablar con nosotros — todo en un solo lugar. Te mostramos rápido dónde está cada cosa.",
  },
  {
    emoji: "📺",
    titulo: "Mis Campañas",
    texto: "Ahí ves el estado de tus paneles activos, cuándo vencen, y puedes pedir una renovación con un clic cuando se acerque la fecha.",
  },
  {
    emoji: "📸",
    titulo: "Evidencias y Reportes",
    texto: "Cada vez que subimos una foto de tu campaña en vivo, te avisamos. Y el día 1 de cada mes te llega tu reporte automático por correo.",
  },
  {
    emoji: "🧾",
    titulo: "Facturas",
    texto: "Todas tus facturas están aquí, sin tener que buscar el correo. Y si algo se vence pronto, te lo decimos antes de que pase.",
  },
];

const STORAGE_KEY = "vista360_onboarding_visto";

export function debeVerOnboarding(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "1";
  } catch {
    return false; // si localStorage falla (modo privado, etc.), no molestamos con esto
  }
}

function marcarVisto() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // sin problema si no se pudo guardar — simplemente se puede repetir
  }
}

interface Props {
  onClose: () => void;
}

export default function OnboardingTour({ onClose }: Props) {
  const [paso, setPaso] = useState(0);
  const esUltimo = paso === PASOS.length - 1;
  const actual = PASOS[paso];

  function cerrar() {
    marcarVisto();
    onClose();
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(13,22,41,0.72)", zIndex: 600,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        style={{
          background: "#fff", borderRadius: 20, padding: "28px 24px 22px",
          width: "100%", maxWidth: 340, boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 44, marginBottom: 14 }}>{actual.emoji}</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#0D1629", marginBottom: 10 }}>
          {actual.titulo}
        </div>
        <div style={{ fontSize: 14, color: "#4B5563", lineHeight: 1.6, marginBottom: 22 }}>
          {actual.texto}
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 20 }}>
          {PASOS.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === paso ? 20 : 7, height: 7, borderRadius: 20,
                background: i === paso ? "#2563EB" : "#E5E7EB",
                transition: "all 0.2s ease",
              }}
            />
          ))}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {!esUltimo && (
            <button
              onClick={cerrar}
              style={{
                flex: 1, padding: "13px", background: "#F3F4F6", border: "none", borderRadius: 12,
                color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer",
              }}
            >
              Saltar
            </button>
          )}
          <button
            onClick={() => (esUltimo ? cerrar() : setPaso((p) => p + 1))}
            style={{
              flex: 1, padding: "13px", background: "#2563EB", border: "none", borderRadius: 12,
              color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}
          >
            {esUltimo ? "Empezar" : "Siguiente"}
          </button>
        </div>
      </div>
    </div>
  );
}
