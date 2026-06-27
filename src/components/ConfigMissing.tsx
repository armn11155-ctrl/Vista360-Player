interface Props {
  missing: readonly string[];
}

/**
 * Se muestra cuando faltan variables VITE_FIREBASE_* en el build.
 * El objetivo es que cualquiera (no solo un programador) pueda mirar
 * la pantalla del panel y saber exactamente qué falta configurar,
 * en vez de ver un cuadro negro sin pistas.
 */
export default function ConfigMissing({ missing }: Props) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1a0707",
        color: "#fff",
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
        padding: 24,
        cursor: "auto",
      }}
    >
      <div style={{ width: "min(560px, 92vw)" }}>
        <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>
          ⚠️ Falta configuración de Firebase
        </div>
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 15, marginBottom: 18 }}>
          Esta pantalla no puede conectarse porque faltan estas variables de
          entorno en el deploy:
        </p>
        <ul
          style={{
            background: "rgba(255,255,255,0.06)",
            borderRadius: 10,
            padding: "14px 18px",
            margin: "0 0 20px",
            fontFamily: "monospace",
            fontSize: 14,
            lineHeight: 1.8,
          }}
        >
          {missing.map((key) => (
            <li key={key}>{key}</li>
          ))}
        </ul>
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 14 }}>
          Agrégalas en Cloudflare Pages → Settings → Environment variables, y
          vuelve a hacer deploy.
        </p>
      </div>
    </div>
  );
}
