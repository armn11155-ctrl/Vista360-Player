import { useEffect, useState, type RefObject } from "react";
import type { EstadoPush } from "../hooks/usePushEstado";

const STORAGE_KEY = "vista360_notif_prompt_visto";

// Mismo criterio que OnboardingTour.tsx: la llave se guarda por uid,
// no global, para que probar varias cuentas de cliente en el mismo
// celular no "gaste" el aviso de la primera cuenta para todas las
// demas.
function clave(uid?: string) {
  return uid ? `${STORAGE_KEY}:${uid}` : STORAGE_KEY;
}

export function debeVerNotifPrompt(uid?: string): boolean {
  try {
    return localStorage.getItem(clave(uid)) !== "1";
  } catch {
    return false; // si localStorage falla (modo privado, etc.), no molestamos con esto
  }
}

function marcarVisto(uid?: string) {
  try {
    localStorage.setItem(clave(uid), "1");
  } catch {
    // sin problema si no se pudo guardar -- simplemente se puede repetir
  }
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Props {
  uid?: string;
  /** Ref al botón real "Activar" del header de Inicio -- se mide su
   *  posición para recortar el hueco del foco de luz justo ahí. */
  targetRef: RefObject<HTMLElement | null>;
  estadoPush: EstadoPush;
  errorPush: string;
  activarPush: (uid?: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Aviso de bienvenida "foco de luz" (spotlight) para activar las
 * notificaciones push apenas se entra a la app -- pedido explícito:
 * en vez de un modal centrado, se oscurece toda la pantalla EXCEPTO
 * el botón "Activar" del header (que ya dice eso, ver Inicio.tsx), y
 * un globo de texto cerca explica que hay que tocar ahí.
 *
 * Se muestra una sola vez (se guarda en localStorage apenas se toca
 * el botón real o "Ahora no") y solo si el navegador soporta push y
 * todavía no se le preguntó permiso -- si ya está activado o
 * bloqueado, ni se monta (ver Inicio.tsx / App.tsx).
 */
export default function NotifPrompt({ uid, targetRef, estadoPush, errorPush, activarPush, onClose }: Props) {
  const [intentado, setIntentado] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    function medir() {
      const el = targetRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }
    medir();
    const t = window.setTimeout(medir, 60); // por si el layout todavía se está acomodando
    window.addEventListener("resize", medir);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", medir);
    };
  }, [targetRef]);

  // Una vez que se pidió el permiso (aceptado, rechazado, o error), se
  // marca como visto y se cierra solo -- con una pequeña pausa para
  // que se alcance a leer el resultado antes de que desaparezca.
  useEffect(() => {
    if (!intentado) return;
    if (estadoPush === "activado" || estadoPush === "error" || estadoPush === "bloqueado") {
      marcarVisto(uid);
      const t = window.setTimeout(onClose, estadoPush === "activado" ? 900 : 1800);
      return () => window.clearTimeout(t);
    }
  }, [intentado, estadoPush, onClose]);

  function cerrar() {
    marcarVisto(uid);
    onClose();
  }

  function iniciarActivar() {
    setIntentado(true);
    void activarPush(uid);
  }

  if (!rect) return null;

  const pad = 6;
  const anillo = {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
    radius: (rect.height + pad * 2) / 2,
  };

  const espacioAbajo = window.innerHeight - (rect.top + rect.height);
  const tooltipAbajo = espacioAbajo > 170;
  const tooltipAncho = 250;
  const tooltipRight = Math.max(12, window.innerWidth - (rect.left + rect.width));

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 550 }}>
      {/* Bloquea toda la pantalla -- a propósito NO tiene onClick de
          cierre: tocar afuera del botón iluminado no debe hacer nada,
          para que la única forma de avanzar sea tocando el botón real
          de Activar (pedido explícito -- antes se cerraba solo con
          tocar cualquier otra parte). */}
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(2,6,15,0.2)" }}
      />
      {/* Anillo que ilumina el botón real (truco: box-shadow gigante
          que pinta todo alrededor de este rectángulo, dejando el
          rectángulo mismo transparente = efecto "foco de luz"). */}
      <div
        style={{
          position: "fixed",
          top: anillo.top, left: anillo.left,
          width: anillo.width, height: anillo.height,
          borderRadius: anillo.radius,
          boxShadow: "0 0 0 9999px rgba(2,6,15,0.86)",
          border: "2px solid rgba(147,197,253,.55)",
          pointerEvents: "none",
        }}
      />
      {/* Botón invisible clickeable, exactamente sobre el botón real. */}
      <button
        type="button"
        onClick={iniciarActivar}
        disabled={estadoPush === "activando"}
        aria-label="Activar notificaciones"
        style={{
          position: "fixed",
          top: rect.top, left: rect.left,
          width: rect.width, height: rect.height,
          borderRadius: rect.height / 2,
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: estadoPush === "activando" ? "default" : "pointer",
        }}
      />
      {/* Globo de texto cerca del foco de luz. */}
      <div
        style={{
          position: "fixed",
          ...(tooltipAbajo
            ? { top: rect.top + rect.height + 16 }
            : { bottom: window.innerHeight - rect.top + 16 }),
          right: tooltipRight,
          width: tooltipAncho,
          maxWidth: "calc(100vw - 24px)",
          background: "linear-gradient(155deg, #0D1B30 0%, #050A14 100%)",
          border: "1px solid rgba(147,197,253,.28)",
          borderRadius: 16,
          padding: "16px 16px 14px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
        }}
      >
        {!intentado && (
          <>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", marginBottom: 6 }}>
              Activa tus notificaciones
            </div>
            <div style={{ fontSize: 12.5, color: "rgba(226,232,240,.78)", lineHeight: 1.5 }}>
              Toca el botón iluminado para recibir avisos de reportes, campañas por vencer y facturas nuevas.
            </div>
          </>
        )}
        {intentado && estadoPush === "activando" && (
          <div style={{ fontSize: 13, color: "rgba(226,232,240,.85)", fontWeight: 700 }}>Activando…</div>
        )}
        {intentado && estadoPush === "activado" && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "#4ADE80", fontWeight: 700 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Notificaciones activadas
          </div>
        )}
        {intentado && estadoPush === "error" && (
          <div style={{ fontSize: 12, color: "#FCA5A5", fontWeight: 600 }}>{errorPush}</div>
        )}
        {intentado && estadoPush === "bloqueado" && (
          <div style={{ fontSize: 12, color: "#FCA5A5", fontWeight: 600 }}>
            El navegador bloqueó el permiso. Puedes activarlo luego desde los ajustes del sitio.
          </div>
        )}
      </div>
    </div>
  );
}
