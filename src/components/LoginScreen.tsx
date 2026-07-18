import { useState } from "react";
import { auth, login } from "../config/firebase";
import { setPersistence, browserLocalPersistence, browserSessionPersistence } from "firebase/auth";

const LOGO = "/logo-player.png";
const SAVED_EMAIL_KEY = "v360_saved_email";
const REMEMBER_KEY = "v360_remember";

interface Props {
  onLoggedIn: () => void;
}

export default function LoginScreen({ onLoggedIn }: Props) {
  const savedRemember = localStorage.getItem(REMEMBER_KEY) !== "false";
  const savedEmail = savedRemember ? (localStorage.getItem(SAVED_EMAIL_KEY) ?? "") : "";

  const [email, setEmail] = useState(savedEmail);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(savedRemember);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Ingresa tu usuario y contraseña.");
      return;
    }
    setBusy(true);
    try {
      if (auth) {
        await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
      }
      // Guardar email si "recordar" está activo
      if (remember) {
        localStorage.setItem(SAVED_EMAIL_KEY, email.trim());
        localStorage.setItem(REMEMBER_KEY, "true");
      } else {
        localStorage.removeItem(SAVED_EMAIL_KEY);
        localStorage.setItem(REMEMBER_KEY, "false");
      }
      await login(email.trim(), password);
      onLoggedIn();
    } catch {
      setError("Usuario o contraseña incorrectos. Si no tienes acceso, contacta a tu ejecutivo en Vista360.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-logo">
        <img src={LOGO} alt="Vista360 Player" draggable={false} />
      </div>
      <div className="login-card">
        <div className="login-title">Iniciar sesión</div>
        <div className="login-sub">Accede a tu portal privado de Vista360 Player.</div>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Usuario</label>
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
          <div className="login-remember" onClick={() => setRemember(r => !r)}>
            <div className={`login-remember-box${remember ? " checked" : ""}`}>
              {remember && (
                <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                  <path d="M1 4L4 7.5L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span className="login-remember-label">Mantener sesión iniciada</span>
          </div>
          <button className="login-btn" disabled={busy} type="submit">
            {busy ? "Ingresando…" : "Iniciar sesión"}
          </button>
        </form>
      </div>
      <div className="login-foot">Vista360 © Portal de clientes</div>
    </div>
  );
}
