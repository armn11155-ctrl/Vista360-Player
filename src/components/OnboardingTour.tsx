import { useState } from "react";

const PASOS = [
  {
    icono: "bienvenida",
    titulo: "¡Bienvenido a Vista360!",
    texto: "Aquí vas a poder ver tus campañas, tus facturas y hablar con nosotros — todo en un solo lugar. Te mostramos rápido dónde está cada cosa.",
  },
  {
    icono: "campanas",
    titulo: "Mis Campañas",
    texto: "Ahí ves el estado de tus paneles activos, cuándo vencen, y puedes pedir una renovación con un clic cuando se acerque la fecha.",
  },
  {
    icono: "reportes",
    titulo: "Evidencias y Reportes",
    texto: "Cada vez que subimos una foto de tu campaña en vivo, te avisamos. Y el día 1 de cada mes te llega tu reporte automático por correo.",
  },
  {
    icono: "facturas",
    titulo: "Facturas",
    texto: "Todas tus facturas están aquí, sin tener que buscar el correo. Y si algo se vence pronto, te lo decimos antes de que pase.",
  },
  {
    icono: "final",
    titulo: "Tu experiencia premium comienza aquí",
    texto: "Bienvenido a Vista360 Player. Todo lo importante de tu publicidad, claro, elegante y siempre a tu alcance.",
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

function Ilustracion({ tipo }: { tipo: string }) {
  if (tipo === "final") {
    return (
      <div style={{ height: 112, display: "grid", placeItems: "center", marginBottom: 16 }}>
        <img src="/logo-player.png" alt="Vista360 Player" style={{ width: 220, maxWidth: "86%", height: "auto" }} />
      </div>
    );
  }

  return (
    <div style={{ width: 112, height: 112, margin: "0 auto 16px", borderRadius: 28, background: "linear-gradient(145deg, rgba(8,119,255,.2), rgba(255,255,255,.04))", border: "1px solid rgba(147,197,253,.18)", display: "grid", placeItems: "center" }}>
      <svg width="78" height="78" viewBox="0 0 96 96" fill="none" aria-hidden="true">
        {tipo === "bienvenida" && (
          <>
            <circle cx="48" cy="48" r="33" fill="#0B2E6B" stroke="#60A5FA" strokeWidth="2" />
            <path d="M28 55c8-1 14-6 17-14 3 9 10 15 22 17" stroke="#EAF3FF" strokeWidth="4" strokeLinecap="round" />
            <path d="M38 34c3-5 9-8 16-7M62 32l5-6M29 36l-6-4" stroke="#93C5FD" strokeWidth="3" strokeLinecap="round" />
            <circle cx="67" cy="58" r="6" fill="#22C55E" />
          </>
        )}
        {tipo === "campanas" && (
          <>
            <rect x="15" y="20" width="66" height="48" rx="8" fill="#0B2E6B" stroke="#60A5FA" strokeWidth="2" />
            <rect x="22" y="27" width="52" height="34" rx="4" fill="#EAF3FF" />
            <path d="M31 53V42M42 53V35M53 53V45M64 53V31" stroke="#0877FF" strokeWidth="5" strokeLinecap="round" />
            <path d="M40 76h16M48 68v8" stroke="#BFDBFE" strokeWidth="4" strokeLinecap="round" />
          </>
        )}
        {tipo === "reportes" && (
          <>
            <rect x="16" y="22" width="45" height="54" rx="7" fill="#EAF3FF" stroke="#60A5FA" strokeWidth="2" />
            <circle cx="29" cy="37" r="5" fill="#0877FF" />
            <path d="m21 64 12-14 9 9 8-11 8 16" stroke="#0B2E6B" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="53" y="15" width="27" height="35" rx="6" fill="#0B2E6B" stroke="#93C5FD" strokeWidth="2" />
            <path d="M60 26h13M60 33h13M60 40h8" stroke="#EAF3FF" strokeWidth="3" strokeLinecap="round" />
          </>
        )}
        {tipo === "facturas" && (
          <>
            <path d="M25 15h40a7 7 0 0 1 7 7v59L64 76l-8 5-8-5-8 5-8-5-8 5V22a7 7 0 0 1 7-7Z" fill="#EAF3FF" stroke="#60A5FA" strokeWidth="2" />
            <path d="M34 32h28M34 42h20M34 61h12" stroke="#0B2E6B" strokeWidth="4" strokeLinecap="round" />
            <circle cx="59" cy="60" r="9" fill="#22C55E" />
            <path d="m55 60 3 3 6-7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </svg>
    </div>
  );
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
          background: "linear-gradient(155deg, #07111F 0%, #03070D 100%)", borderRadius: 24, padding: "28px 24px 22px",
          width: "100%", maxWidth: 360, boxShadow: "0 28px 70px rgba(0,0,0,0.48)", border: "1px solid rgba(147,197,253,.16)",
          textAlign: "center",
        }}
      >
        <Ilustracion tipo={actual.icono} />
        <div style={{ fontSize: 19, fontWeight: 850, color: "#FFFFFF", marginBottom: 10 }}>
          {actual.titulo}
        </div>
        <div style={{ fontSize: 13.5, color: "rgba(226,232,240,.72)", lineHeight: 1.6, marginBottom: 22 }}>
          {actual.texto}
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 20 }}>
          {PASOS.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === paso ? 20 : 7, height: 7, borderRadius: 20,
                background: i === paso ? "#60A5FA" : "rgba(255,255,255,.16)",
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
                flex: 1, padding: "13px", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12,
                color: "#E2E8F0", fontWeight: 700, fontSize: 14, cursor: "pointer",
              }}
            >
              Saltar
            </button>
          )}
          <button
            onClick={() => (esUltimo ? cerrar() : setPaso((p) => p + 1))}
            style={{
              flex: 1, padding: "13px", background: "#0877FF", border: "none", borderRadius: 12,
              color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}
          >
            {esUltimo ? "Entrar a Vista360" : "Siguiente"}
          </button>
        </div>
      </div>
    </div>
  );
}
