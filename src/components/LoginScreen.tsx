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
      <main className="login-experience">
        <section
          className="login-left-panel"
          aria-label="Vista360 Player. Más que visibilidad. Presencia. Campañas, cobertura y resultados conectados."
        >
          <div className="login-network-stage" aria-hidden="true">
            <div className="login-network-copy">
              <div className="login-network-kicker"><span />Publicidad exterior premium</div>
              <img className="login-network-logo" src={LOGO} alt="" draggable={false} />
              <h1>Más que visibilidad.<strong>Presencia.</strong></h1>
              <p>Campañas, cobertura y resultados conectados en una sola plataforma.</p>
              <div className="login-network-live"><i /><span>Red de campaña activa</span></div>
            </div>

            <div className="login-network-visual-globe">
              <svg className="login-network-globe" viewBox="0 0 720 720" fill="none">
                <defs>
                  <pattern id="v360-globe-dots" width="16" height="16" patternUnits="userSpaceOnUse">
                    <circle cx="3" cy="3" r="2.25" fill="currentColor" />
                  </pattern>
                  <radialGradient id="v360-globe-core" cx="0" cy="0" r="1" gradientTransform="translate(360 330) rotate(90) scale(290)">
                    <stop stopColor="#4B8FFF" stopOpacity=".24" />
                    <stop offset=".58" stopColor="#1759C7" stopOpacity=".10" />
                    <stop offset="1" stopColor="#061B42" stopOpacity="0" />
                  </radialGradient>
                  <filter id="v360-node-glow" x="-180%" y="-180%" width="460%" height="460%">
                    <feGaussianBlur stdDeviation="7" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                  <clipPath id="v360-globe-clip"><circle cx="360" cy="350" r="246" /></clipPath>
                </defs>

                <g className="login-network-orbit login-network-orbit-outer">
                  <ellipse cx="360" cy="350" rx="306" ry="212" transform="rotate(-18 360 350)" />
                  <circle cx="90" cy="250" r="4" />
                  <circle cx="628" cy="465" r="4" />
                </g>
                <circle className="login-network-halo" cx="360" cy="350" r="270" />
                <circle className="login-network-core" cx="360" cy="350" r="246" fill="url(#v360-globe-core)" />

                <g className="login-network-sphere" clipPath="url(#v360-globe-clip)">
                  <circle className="login-network-dot-field" cx="360" cy="350" r="244" fill="url(#v360-globe-dots)" />
                  <g className="login-network-grid">
                    <ellipse cx="360" cy="350" rx="245" ry="88" />
                    <ellipse cx="360" cy="350" rx="245" ry="166" />
                    <ellipse cx="360" cy="350" rx="84" ry="245" />
                    <ellipse cx="360" cy="350" rx="168" ry="245" />
                    <path d="M115 350H605" />
                  </g>
                  <g className="login-network-land">
                    <path d="M181 219L213 184L265 168L303 187L296 219L263 229L248 262L216 276L192 259Z" />
                    <path d="M249 291L292 302L311 339L296 382L274 423L259 466L234 445L226 396L208 353L218 314Z" />
                    <path d="M348 185L390 167L447 178L486 203L515 230L505 263L469 272L450 306L416 299L399 329L371 314L365 274L337 248Z" />
                    <path d="M372 322L416 314L451 343L446 391L422 444L389 466L367 430L353 382Z" />
                    <path d="M480 397L520 385L548 407L532 441L493 448L470 424Z" />
                  </g>
                  <g className="login-network-routes">
                    <path pathLength="1" d="M255 362C312 293 389 278 470 244" />
                    <path pathLength="1" d="M255 362C323 394 394 403 487 417" />
                    <path pathLength="1" d="M255 362C216 307 212 253 243 214" />
                    <path pathLength="1" d="M470 244C447 301 445 360 487 417" />
                  </g>
                </g>

                <g className="login-network-nodes" filter="url(#v360-node-glow)">
                  <g className="login-network-node login-network-node-primary" transform="translate(255 362)"><circle r="15" /><circle r="5" /></g>
                  <g className="login-network-node" transform="translate(470 244)"><circle r="11" /><circle r="4" /></g>
                  <g className="login-network-node" transform="translate(487 417)"><circle r="11" /><circle r="4" /></g>
                  <g className="login-network-node" transform="translate(243 214)"><circle r="9" /><circle r="3.5" /></g>
                </g>
              </svg>
              <div className="login-network-label login-network-label-coverage"><i />Cobertura</div>
              <div className="login-network-label login-network-label-results"><i />Resultados</div>
            </div>

          </div>
        </section>

        <section className="login-right-panel" aria-label="Acceso al portal">
          <div className="login-logo">
            <img src={LOGO} alt="Vista360 Player" draggable={false} />
            <div className="login-tagline">Más que visibilidad. Presencia.</div>
          </div>
          <div className="login-card">
            <div className="login-access-kicker">
              <span>Acceso privado</span>
              <strong>V360</strong>
            </div>
            <div className="login-title">Bienvenido</div>
            <div className={`login-message-stack${error ? " has-error" : ""}`}>
              <div className="login-sub">Ingresa tus credenciales para continuar.</div>
              {error && <div id="login-error" className="login-error" role="alert">{error}</div>}
            </div>
            <form onSubmit={submit}>
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">Usuario</label>
              <div className="login-input-wrap">
                <span className="login-input-icon"><IconoUsuario /></span>
                <input
                  id="login-email"
                  name="email"
                  className="form-input"
                  type="email"
                  autoComplete="email"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "login-error" : undefined}
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
                  name="password"
                  className="form-input"
                  type={mostrarPassword ? "text" : "password"}
                  autoComplete="current-password"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "login-error" : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setMostrarPassword((v) => !v)}
                  aria-label={mostrarPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
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
            <label className="login-remember">
              <input
                className="login-remember-native"
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span className={`login-remember-box${remember ? " checked" : ""}`} aria-hidden="true">
                {remember && (
                  <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                    <path d="M1 4L4 7.5L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </span>
              <span className="login-remember-label">Mantener sesión iniciada</span>
            </label>
            <button
              className={`login-btn${busy ? " is-busy" : ""}`}
              disabled={busy}
              type="submit"
              aria-busy={busy}
            >
              <span className="login-btn-content">
                <span className="login-btn-spinner" aria-hidden="true" />
                <span>{busy ? "Ingresando…" : "Ingresar"}</span>
              </span>
            </button>
            </form>
          </div>
          <div className="login-foot">
            <span>Conexión protegida</span>
            <span aria-hidden="true">•</span>
            <span>Portal de clientes</span>
          </div>
        </section>
      </main>
    </div>
  );
}
