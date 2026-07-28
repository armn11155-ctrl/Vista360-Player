import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Red de seguridad para errores de render.
 *
 * Sin esto, si CUALQUIER componente lanza un error mientras se dibuja,
 * React desmonta el árbol entero y el usuario se queda con una pantalla
 * completamente en blanco: sin mensaje, sin botón, sin forma de volver.
 * En una PWA instalada ni siquiera basta con cerrar y abrir, porque el
 * estado se restaura y vuelve a fallar igual.
 *
 * Tiene que ser una clase: los Error Boundaries son la única cosa en
 * React que todavía no se puede hacer con hooks.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Queda en la consola del navegador para poder diagnosticarlo si el
    // usuario reporta el problema. No se manda a ningún lado: no hay
    // servicio de registro configurado, y mandarlo a un tercero sin
    // avisar sería meter datos del cliente donde no corresponde.
    console.error("Error no controlado en la interfaz:", error, info.componentStack);
  }

  private recargar = () => {
    // Recarga completa en vez de limpiar el estado: si el error vino de
    // datos corruptos en memoria, seguir con el mismo estado lo repite.
    window.location.reload();
  };

  private volverAlInicio = () => {
    // Salida de emergencia cuando recargar tampoco sirve porque la
    // pantalla que falla es justo la que quedó abierta.
    window.location.href = "/";
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: "100dvh",
          background: "#050A12",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 24px",
          textAlign: "center",
          boxSizing: "border-box",
        }}
      >
        <img
          src="/logo-player.webp"
          alt="Vista360 Player"
          decoding="async"
          style={{ width: 132, marginBottom: 28, opacity: 0.9 }}
        />

        <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 10 }}>
          Algo se rompió de nuestro lado
        </div>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: "#94A3B8",
            margin: "0 0 26px",
            maxWidth: 340,
          }}
        >
          No es culpa tuya y tus datos están a salvo. Vuelve a cargar la app;
          si sigue pasando, escríbenos y lo revisamos.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 300 }}>
          <button
            type="button"
            onClick={this.recargar}
            style={{
              padding: "14px", borderRadius: 12, border: "none",
              background: "#0877FF", color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}
          >
            Volver a cargar
          </button>
          <button
            type="button"
            onClick={this.volverAlInicio}
            style={{
              padding: "14px", borderRadius: 12,
              border: "1.5px solid rgba(255,255,255,0.18)",
              background: "transparent", color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}
          >
            Ir al inicio
          </button>
        </div>

        {/* El detalle técnico va plegado: no asusta a quien no lo necesita,
            pero está a mano si nos lo tiene que pasar para diagnosticar. */}
        <details style={{ marginTop: 28, maxWidth: 340, width: "100%" }}>
          <summary style={{ fontSize: 12, color: "#64748B", cursor: "pointer" }}>
            Detalle técnico
          </summary>
          <pre
            style={{
              marginTop: 10, padding: 12, borderRadius: 12,
              background: "rgba(255,255,255,0.05)", color: "#94A3B8",
              fontSize: 11, lineHeight: 1.5, textAlign: "left",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              maxHeight: 180, overflow: "auto",
            }}
          >
            {error.message || String(error)}
          </pre>
        </details>
      </div>
    );
  }
}
