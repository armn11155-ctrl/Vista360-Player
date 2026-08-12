import { useState } from "react";
import { auth, login } from "../config/firebase";
import { setPersistence, browserLocalPersistence, browserSessionPersistence } from "firebase/auth";
import type { MultiFactorResolver } from "firebase/auth";
import { mensajeDeError } from "../utils/errores";
import { completarLoginConCodigo, pideSegundoFactor, resolverDeSegundoFactor } from "../config/mfa";
import PixelGlobe from "./PixelGlobe";

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
  // Login en dos pasos cuando la cuenta tiene segundo factor. Mientras
  // resolverMfa no sea null, la contraseña ya se validó pero la sesión
  // NO existe todavía.
  const [resolverMfa, setResolverMfa] = useState<MultiFactorResolver | null>(null);
  const [codigoMfa, setCodigoMfa] = useState("");

  async function enviarCodigoMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!resolverMfa || busy) return;
    setBusy(true);
    setError("");
    try {
      await completarLoginConCodigo(resolverMfa, codigoMfa);
      onLoggedIn();
    } catch (error) {
      setError(mensajeDeError(error, "Código incorrecto o vencido. Revisa tu aplicación de autenticación."));
    } finally {
      setBusy(false);
    }
  }

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
      // La contraseña era correcta, pero la cuenta tiene un segundo
      // factor: Firebase NO ha creado la sesión todavía. Se guarda el
      // "resolver" que devuelve el SDK y se pide el código.
      //
      // Importante: aquí no se decide nada. La sesión la crea Firebase
      // en completarLoginConCodigo() y solo si el código es válido. No
      // existe ninguna bandera local que se pueda poner a mano para
      // saltarse este paso -- sin código, no hay sesión que falsificar.
      if (pideSegundoFactor(error)) {
        const resolver = resolverDeSegundoFactor(error);
        if (resolver) {
          setResolverMfa(resolver);
          setError("");
          setBusy(false);
          return;
        }
      }
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
              <div className="login-network-message">
                <h1>Más que visibilidad.<strong>Presencia.</strong></h1>
                <p>Campañas, cobertura y resultados conectados en una sola plataforma.</p>
                <div className="login-network-live"><i /><span>Red de campaña activa</span></div>
              </div>
            </div>

            <div className="login-network-visual-globe">
              <PixelGlobe />
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
            <div className="login-title">{resolverMfa ? "Verificación en dos pasos" : "Bienvenido"}</div>
            <div className={`login-message-stack${error ? " has-error" : ""}`}>
              <div className="login-sub">
                {resolverMfa
                  ? "Escribe el código de 6 dígitos de tu aplicación de autenticación."
                  : "Ingresa tus credenciales para continuar."}
              </div>
              {error && <div id="login-error" className="login-error" role="alert">{error}</div>}
            </div>

            {/* Segundo paso: la contraseña ya se validó, pero la sesión
                todavía NO existe. Solo Firebase puede crearla, y solo
                con un código válido. */}
            {resolverMfa ? (
              <form onSubmit={enviarCodigoMfa}>
                <div className="form-group">
                  <label className="form-label" htmlFor="login-mfa">Código de verificación</label>
                  <div className="login-input-wrap">
                    <input
                      id="login-mfa"
                      className="form-input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus
                      maxLength={6}
                      value={codigoMfa}
                      onChange={(e) => setCodigoMfa(e.target.value.replace(/\D/g, ""))}
                      placeholder="000000"
                      aria-describedby={error ? "login-error" : undefined}
                    />
                  </div>
                </div>
                <button
                  className={`login-btn${busy ? " is-busy" : ""}`}
                  disabled={busy || codigoMfa.length < 6}
                  type="submit"
                  aria-busy={busy}
                >
                  <span className="login-btn-content">
                    <span className="login-btn-spinner" aria-hidden="true" />
                    <span>{busy ? "Verificando…" : "Verificar"}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="login-secondary-link"
                  style={{ marginTop: 14, background: "none", border: "none", color: "#64748B", fontSize: 13, cursor: "pointer", width: "100%" }}
                  onClick={() => { setResolverMfa(null); setCodigoMfa(""); setError(""); }}
                >
                  Volver
                </button>
              </form>
            ) : (
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
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError("");
                  }}
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
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError("");
                  }}
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
            )}
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
