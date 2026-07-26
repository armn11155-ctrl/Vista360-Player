import { useEffect, useState, type RefObject } from "react";
import type { EstadoPush } from "../hooks/usePushEstado";
import { esMovil, navegadorEscritorio } from "../utils/dispositivo";

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
 * A propósito NO se guarda ningún "ya lo vi" en localStorage: se pidió
 * que aparezca SIEMPRE que la cuenta entre sin notificaciones activadas
 * todavía (celular nuevo, reinstaló la app, etc.), no solo una vez.
 * App.tsx decide cuándo abrirlo (estado "ofrecer") y este componente
 * solo avisa cuándo cerrarlo (onClose), una vez que se intentó activar
 * y el resultado ya se pudo leer en pantalla.
 */
/** Pasos para desbloquear el permiso desde una COMPUTADORA -- distinto
 *  de un celular: acá no hay "Ajustes del sistema", el permiso se
 *  cambia desde la configuración del propio navegador (candado/ícono
 *  junto a la dirección de la página). Varía un poco el nombre exacto
 *  según el navegador, así que se ajusta el texto al detectado. */
function pasosDesbloqueoEscritorio(): string[] {
  const navegador = navegadorEscritorio();
  if (navegador === "safari") {
    return [
      "Abre el menú Safari (arriba a la izquierda) y entra a \"Ajustes\" (o \"Preferencias\").",
      "Ve a la pestaña \"Sitios web\" y elige \"Notificaciones\" en la lista de la izquierda.",
      "Busca este sitio en la lista de la derecha y cambia su menú a \"Permitir\".",
      "Vuelve a esta pestaña -- se detecta solo, sin recargar.",
    ];
  }
  if (navegador === "firefox") {
    return [
      "Haz clic en el candado junto a la dirección de esta página.",
      "Abre \"Más información\" > \"Permisos\" y cambia Notificaciones a \"Permitir\".",
      "Vuelve a esta pestaña -- se detecta solo, sin recargar.",
    ];
  }
  // Chrome, Edge y el resto de navegadores basados en Chromium usan el
  // mismo ícono y flujo -- se deja como caso general.
  return [
    "Haz clic en el candado (o el ícono junto a la dirección) de esta página.",
    "Busca \"Notificaciones\" y cámbialo a \"Permitir\".",
    "Vuelve a esta pestaña -- se detecta solo, sin recargar.",
  ];
}

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
    // El botón real cambia de ancho según el texto ("Activar" ->
    // "Activando…" -> "Bloqueado") -- antes solo se remedía en el
    // resize de la VENTANA, así que el foco de luz se quedaba con las
    // medidas viejas apenas cambiaba el texto y el aro/botón invisible
    // quedaban desalineados del botón real ("se sale del cuadro").
    // ResizeObserver detecta cualquier cambio de tamaño del propio
    // elemento, no solo de la ventana.
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined" && targetRef.current) {
      observer = new ResizeObserver(medir);
      observer.observe(targetRef.current);
    }
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", medir);
      observer?.disconnect();
    };
  }, [targetRef]);

  // Una vez que se activó de verdad, se cierra solo (con una pequeña
  // pausa para que se alcance a leer el "Notificaciones activadas").
  // Si hubo un error técnico también se cierra -- el permiso ya quedó
  // concedido en el navegador aunque haya fallado el guardado del
  // token, así que la próxima vez que entre ya se detecta como
  // "activado" (ver usePushEstado). Pero si el navegador BLOQUEÓ el
  // permiso (le dieron "No permitir"), a propósito NO se cierra solo
  // -- pedido explícito: mientras no esté realmente activado, la app
  // se queda en el foco de luz. Recién se libera solo cuando vuelva a
  // entrar habiendo cambiado el permiso a mano en los ajustes del
  // teléfono (ahí sí se detecta "granted" y ya ni se monta este aviso).
  useEffect(() => {
    // "activado" se cierra solo SIN importar si el tap pasó en esta
    // sesión ("intentado") -- antes esto exigía "intentado", pero
    // desde que usePushEstado también detecta el permiso concedido
    // desde afuera (cambiado a mano en los ajustes del navegador,
    // detectado al volver a la pestaña -- ver usePushEstado.ts), el
    // estado puede pasar a "activado" sin que nadie haya tocado el
    // botón invisible en este montaje. Con el "intentado" de antes,
    // ese caso dejaba el foco de luz trabado para siempre aunque las
    // notificaciones ya estuvieran realmente activadas.
    if (estadoPush === "activado") {
      const t = window.setTimeout(onClose, intentado ? 900 : 300);
      return () => window.clearTimeout(t);
    }
    // "error" sí depende de haber tocado el botón en esta sesión --
    // ese estado solo lo puede generar activar() (nunca la detección
    // pasiva de usePushEstado), así que si estadoPush es "error" acá
    // "intentado" siempre va a ser true de todos modos.
    if (intentado && estadoPush === "error") {
      const t = window.setTimeout(onClose, 1800);
      return () => window.clearTimeout(t);
    }
  }, [intentado, estadoPush, onClose]);

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
  // Un poco más ancho cuando está bloqueado -- el mensaje con los
  // pasos de Ajustes (lista numerada) necesita más espacio que el
  // texto corto normal.
  const tooltipAncho = estadoPush === "bloqueado" ? 280 : 250;
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
        {/* "activado" se muestra SIEMPRE que el estado ya sea ese,
            sin importar "intentado" -- puede haber llegado por tocar
            el botón en esta sesión, o por detectarse solo al volver a
            la pestaña con el permiso ya arreglado desde los ajustes
            del navegador (ver usePushEstado.ts). */}
        {estadoPush === "activado" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "#4ADE80", fontWeight: 700 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Notificaciones activadas
          </div>
        ) : intentado && estadoPush === "activando" ? (
          <div style={{ fontSize: 13, color: "rgba(226,232,240,.85)", fontWeight: 700 }}>Activando…</div>
        ) : intentado && estadoPush === "error" ? (
          <div style={{ fontSize: 12, color: "#FCA5A5", fontWeight: 600 }}>{errorPush}</div>
        ) : estadoPush !== "bloqueado" && (
          <>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", marginBottom: 6 }}>
              Activa tus notificaciones
            </div>
            <div style={{ fontSize: 12.5, color: "rgba(226,232,240,.78)", lineHeight: 1.5 }}>
              Toca el botón iluminado y dale <strong style={{ color: "#fff" }}>Permitir</strong> en el aviso del teléfono para continuar. Así te avisamos apenas tengas un reporte nuevo, una campaña por vencer o una factura.
            </div>
          </>
        )}
        {/* Sin "intentado &&" a propósito -- este mensaje tiene que
            verse tanto si acaba de rechazarlo recién (dentro de la
            misma sesión) como si vuelve a entrar más tarde con el
            permiso ya bloqueado de antes (ahí "intentado" arranca en
            false porque todavía no tocó nada en ESTE ingreso). */}
        {estadoPush === "bloqueado" && (
          <div>
            <div style={{ fontSize: 12.5, color: "#FCA5A5", fontWeight: 800, marginBottom: 8 }}>
              Bloqueaste el permiso -- actívalo así:
            </div>
            {esMovil() ? (
              <ol style={{ margin: 0, padding: "0 0 0 18px", fontSize: 12, color: "rgba(226,232,240,.85)", lineHeight: 1.6 }}>
                <li>Abre <strong style={{ color: "#fff" }}>Ajustes</strong> en tu teléfono.</li>
                <li>Entra a <strong style={{ color: "#fff" }}>Notificaciones</strong>.</li>
                <li>Busca y toca <strong style={{ color: "#fff" }}>Vista360 Player</strong> en la lista.</li>
                <li>Activa <strong style={{ color: "#fff" }}>Permitir notificaciones</strong>.</li>
                <li>Vuelve a abrir esta app.</li>
              </ol>
            ) : (
              <ol style={{ margin: 0, padding: "0 0 0 18px", fontSize: 12, color: "rgba(226,232,240,.85)", lineHeight: 1.6 }}>
                {pasosDesbloqueoEscritorio().map((paso, i) => (
                  <li key={i}>{paso}</li>
                ))}
              </ol>
            )}
            <div style={{ fontSize: 11.5, color: "rgba(226,232,240,.6)", marginTop: 8, lineHeight: 1.4 }}>
              Apenas lo actives, se detecta solo (no hace falta recargar más de una vez) y te llega un aviso confirmando que quedó listo.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
