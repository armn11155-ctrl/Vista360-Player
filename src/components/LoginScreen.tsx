import { useState } from "react";
import { login } from "../config/firebase";

const LOGO = "/logo-player.png";

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
