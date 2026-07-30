import { useState } from "react";
import { auth, login } from "../config/firebase";
import { setPersistence, browserLocalPersistence, browserSessionPersistence } from "firebase/auth";
import { mensajeDeError } from "../utils/errores";

const LOGO = "/logo-player.webp";
const SAVED_EMAIL_KEY = "v360_saved_email";
const REMEMBER_KEY = "v360_remember";

interface Props {
  onLoggedIn: () => void;
}

/** Ícono de persona para el campo "Usuario" -- mismo trazo (stroke,
 *  strokeWidth 1.8, redondeado) que ya usa el ojo de mostrar/ocultar
 *  contraseña, para que se vea como un solo set de íconos. */
function IconoUsuario() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconoCandado() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="10.5" width="16" height="10" rx="2.2" />
      <path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" />
    </svg>
  );
}

export default function LoginScreen({ onLoggedIn }: Props) {
  const savedRemember = localStorage.getItem(REMEMBER_KEY) !== "false";
  const savedEmail = savedRemember ? (localStorage.getItem(SAVED_EMAIL_KEY) ?? "") : "";

  const [email, setEmail] = useState(savedEmail);
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
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
    } catch (error) {
      setError(mensajeDeError(error, "Usuario o contraseña incorrectos. Si no tienes acceso, contacta a tu ejecutivo en Vista360."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      {/* Logo arriba de la tarjeta, igual en celular y en escritorio
          -- a pedido del usuario ya no van separados en 2 columnas.
          En escritorio este bloque completo se ubica del lado
          izquierdo de la pantalla (ver .login-shell en app.css),
          dejando la foto de la ciudad más visible a la derecha. */}
      <div className="login-right-panel">
        <div className="login-logo">
          <img src={LOGO} alt="Vista360 Player" draggable={false} />
        </div>
        <div className="login-card">
          <div className="login-title">Bienvenido</div>
          <div className="login-sub">Ingresa tus credenciales para continuar.</div>
          {error && <div className="login-error">{error}</div>}
          <form onSubmit={submit}>
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">Usuario</label>
              <div className="login-input-wrap">
                <span className="login-input-icon"><IconoUsuario /></span>
                <input
                  id="login-email"
                  className="form-input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="correo@empresa.com"
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="login-password">Contraseña</label>
              <div className="login-password-wrap">
                <span className="login-input-icon"><IconoCandado /></span>
                <input
                  id="login-password"
                  className="form-input"
                  type={mostrarPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setMostrarPassword((v) => !v)}
                  aria-label={mostrarPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  tabIndex={-1}
                >
                  {mostrarPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.62 21.62 0 0 1 5.06-6.06M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 8 11 8a21.6 21.6 0 0 1-2.61 3.94M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
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
              {busy ? "Ingresando…" : "Ingresar"}
            </button>
          </form>
        </div>
        <div className="login-foot">Vista360 Player © Portal de clientes</div>
      </div>
    </div>
  );
}
