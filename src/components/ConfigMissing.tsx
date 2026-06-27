interface Props {
  missing: readonly string[];
}

export default function ConfigMissing({ missing }: Props) {
  return (
    <div className="state-screen" style={{ background: "#1a0707" }}>
      <div className="state-title" style={{ color: "#fff" }}>⚠️ Falta configuración de Firebase</div>
      <div className="state-sub" style={{ color: "rgba(255,255,255,0.65)" }}>
        Faltan estas variables de entorno en el deploy:
      </div>
      <ul
        style={{
          background: "rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: "12px 18px",
          fontFamily: "monospace",
          fontSize: 13,
          color: "#fff",
          textAlign: "left",
        }}
      >
        {missing.map((key) => (
          <li key={key}>{key}</li>
        ))}
      </ul>
      <div className="state-sub" style={{ color: "rgba(255,255,255,0.5)" }}>
        Agrégalas en Cloudflare Pages → Settings → Environment variables, y vuelve a hacer deploy.
      </div>
    </div>
  );
}
