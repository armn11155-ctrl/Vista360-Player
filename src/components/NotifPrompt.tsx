import { useEffect, useState } from "react";
import { usePushEstado } from "../hooks/usePushEstado";

const STORAGE_KEY = "vista360_notif_prompt_visto";

export function debeVerNotifPrompt(): boolean {
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
    // sin problema si no se pudo guardar -- simplemente se puede repetir
  }
}

interface Props {
  uid?: string;
  onClose: () => void;
}

/**
 * Aviso de bienvenida a pantalla completa (mismo estilo "bloqueante"
 * que OnboardingTour) para activar las notificaciones push apenas se
 * entra a la app -- el admin pidió esto explícitamente porque, dejado
 * solo dentro de la campanita, casi nadie lo encontraba ni sabía si ya
 * estaba activado o no.
 *
 * Se muestra una sola vez (se guarda en localStorage apenas se toca
 * cualquiera de los dos botones) y solo si el navegador soporta push
 * y todavía no se le preguntó permiso -- si ya está activado o
 * bloqueado de antes, este componente ni se monta (ver App.tsx).
 */
export default function NotifPrompt({ uid, onClose }: Props) {
  const { estado, error, activar } = usePushEstado();
  const [intentado, setIntentado] = useState(false);
  const activando = estado === "activando";

  // Una vez que se pidió el permiso (aceptado, rechazado, o error),
  // se marca como visto y se cierra solo -- con una pequeña pausa
  // para que se alcance a leer el resultado antes de que desaparezca.
  useEffect(() => {
    if (!intentado) return;
    if (estado === "activado" || estado === "error" || estado === "bloqueado") {
      marcarVisto();
      const t = window.setTimeout(onClose, estado === "activado" ? 900 : 1600);
      return () => window.clearTimeout(t);
    }
  }, [intentado, estado, onClose]);

  function cerrar() {
    marcarVisto();
    onClose();
  }

  function iniciarActivar() {
    setIntentado(true);
    void activar(uid);
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
        <div style={{
          width: 84, height: 84, margin: "0 auto 18px", borderRadius: 22,
          background: "linear-gradient(145deg, rgba(8,119,255,.2), rgba(255,255,255,.04))",
          border: "1px solid rgba(147,197,253,.18)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>

        <div style={{ fontSize: 19, fontWeight: 850, color: "#FFFFFF", marginBottom: 10 }}>
          Activa tus notificaciones
        </div>
        <div style={{ fontSize: 13.5, color: "rgba(226,232,240,.72)", lineHeight: 1.6, marginBottom: 20 }}>
          Entérate al instante cuando tengas un reporte nuevo, una campaña por vencer o una factura — aunque no tengas la app abierta.
        </div>

        {intentado && estado === "error" && (
          <div style={{ fontSize: 12, color: "#FCA5A5", marginBottom: 16, fontWeight: 600 }}>{error}</div>
        )}
        {intentado && estado === "bloqueado" && (
          <div style={{ fontSize: 12, color: "#FCA5A5", marginBottom: 16, fontWeight: 600 }}>
            El navegador bloqueó el permiso. Puedes activarlo luego desde los ajustes del sitio.
          </div>
        )}
        {intentado && estado === "activado" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 13, color: "#4ADE80", fontWeight: 700, marginBottom: 16 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Notificaciones activadas
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          {!(intentado && estado === "activado") && (
            <button
              onClick={cerrar}
              disabled={activando}
              style={{
                flex: 1, padding: "13px", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12,
                color: "#E2E8F0", fontWeight: 700, fontSize: 14, cursor: activando ? "default" : "pointer",
              }}
            >
              Ahora no
            </button>
          )}
          {!(intentado && (estado === "activado" || estado === "error" || estado === "bloqueado")) && (
            <button
              onClick={iniciarActivar}
              disabled={activando}
              style={{
                flex: 1, padding: "13px", background: activando ? "#3B82F6" : "#0877FF", border: "none", borderRadius: 12,
                color: "#fff", fontWeight: 700, fontSize: 14, cursor: activando ? "default" : "pointer", opacity: activando ? 0.8 : 1,
              }}
            >
              {activando ? "Activando…" : "Activar notificaciones"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
