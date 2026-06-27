import { useState } from "react";
import { login } from "../config/firebase";

const LOGO =
  "data:image/png;base64,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";

interface Props {
  onLoggedIn: () => void;
}

export default function LoginScreen({ onLoggedIn }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Ingresa tu correo y contraseña.");
      return;
    }
    setBusy(true);
    try {
      await login(email.trim(), password);
      onLoggedIn();
    } catch {
      setError("Correo o contraseña incorrectos. Si no tienes acceso, contacta a tu ejecutivo en Vista360.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-logo">
        <img src={LOGO} alt="Vista360 Player" />
      </div>
      <div className="login-card">
        <div className="login-title">Bienvenido</div>
        <div className="login-sub">Ingresa con la cuenta que te proporcionó tu ejecutivo de Vista360.</div>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Correo</label>
            <input
              className="form-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@empresa.com"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Contraseña</label>
            <input
              className="form-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button className="login-btn" disabled={busy} type="submit">
            {busy ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </div>
      <div className="login-foot">Vista360 © Portal de clientes</div>
    </div>
  );
}
