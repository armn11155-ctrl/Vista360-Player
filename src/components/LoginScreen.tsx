import { useEffect, useState } from "react";
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
  const [campoEnFoco, setCampoEnFoco] = useState(false);

  useEffect(() => {
    const clase = "login-keyboard-open";
    const raiz = document.documentElement;
    const cuerpo = document.body;

    if (!campoEnFoco) {
      raiz.classList.remove(clase);
      cuerpo.classList.remove(clase);
      return;
    }

    raiz.classList.add(clase);
    cuerpo.classList.add(clase);

    return () => {
      raiz.classList.remove(clase);
      cuerpo.classList.remove(clase);
    };
  }, [campoEnFoco]);

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
    <div className={`login-shell${campoEnFoco ? " login-field-focused" : ""}`}>
      <main className="login-experience">
        <section
          className="login-left-panel"
          aria-label="Vista360 Player. Más que visibilidad. Presencia. Marca, alcance e impacto."
        >
          <img
            className="login-billboard-structure"
            src="/login-panel-estructura-premium-v9.png"
            alt=""
            aria-hidden="true"
            draggable={false}
          />
          <div className="login-led-screen" aria-hidden="true">
            <div className="login-led-scene login-led-scene-identity">
              <div className="login-led-eyebrow"><span />Publicidad exterior premium</div>
              <img className="login-led-logo" src={LOGO} alt="" draggable={false} />
              <h1 className="login-led-title">Más que visibilidad.<strong>Presencia.</strong></h1>
            </div>

            <div className="login-led-scene login-led-scene-coverage">
              <div className="login-led-copy">
                <div className="login-led-eyebrow"><span />Cobertura</div>
                <h2>Tu campaña,<strong>en una sola vista.</strong></h2>
                <p>Ubicaciones claras. Decisiones rápidas.</p>
              </div>
              <svg className="login-coverage-map" viewBox="0 0 320 210" fill="none">
                <path d="M18 52C61 26 95 33 129 57C166 83 198 74 222 48C248 20 280 24 306 42" />
                <path d="M10 126C45 101 78 107 108 135C139 165 177 167 207 143C240 116 275 117 312 143" />
                <path d="M65 12C78 51 73 86 49 118C29 145 31 174 52 201" />
                <path d="M178 7C163 42 167 77 189 104C215 137 221 169 207 203" />
                <path d="M270 8C248 49 248 83 269 109C288 132 290 164 274 202" />
                <g className="login-map-pin login-map-pin-one"><circle cx="72" cy="105" r="12" /><circle cx="72" cy="105" r="4" /></g>
                <g className="login-map-pin login-map-pin-two"><circle cx="178" cy="72" r="12" /><circle cx="178" cy="72" r="4" /></g>
                <g className="login-map-pin login-map-pin-three"><circle cx="251" cy="142" r="12" /><circle cx="251" cy="142" r="4" /></g>
                <path className="login-map-route" d="M72 105C103 83 139 79 178 72C205 68 224 93 251 142" />
              </svg>
            </div>

            <div className="login-led-scene login-led-scene-control">
              <div className="login-control-visual">
                <div className="login-control-card-head">
                  <span>Campaña principal</span>
                  <strong><i />En ejecución</strong>
                </div>
                <div className="login-control-metric"><span>Paneles activos</span><strong>12</strong></div>
                <div className="login-control-progress"><i /></div>
                <div className="login-control-details"><span>Ubicaciones</span><span>Estado</span><span>Evidencias</span></div>
              </div>
              <div className="login-led-copy">
                <div className="login-led-eyebrow"><span />Control</div>
                <h2>Control en<strong>tiempo real.</strong></h2>
                <p>Todo lo importante, siempre a la vista.</p>
              </div>
            </div>

            <div className="login-led-scene login-led-scene-results">
              <div className="login-led-copy">
                <div className="login-led-eyebrow"><span />Resultados</div>
                <h2>Listos para<strong>presentar.</strong></h2>
                <p>Evidencias y reportes en un solo lugar.</p>
              </div>
              <div className="login-report-visual">
                <div className="login-report-sheet">
                  <div className="login-report-sheet-head"><span>REPORTE</span><i>PDF</i></div>
                  <div className="login-report-chart"><span /><span /><span /><span /></div>
                  <div className="login-report-lines"><i /><i /><i /></div>
                </div>
                <div className="login-report-check">✓</div>
              </div>
            </div>

            <div className="login-led-scene login-led-scene-closing">
              <img className="login-led-logo login-led-logo-closing" src={LOGO} alt="" draggable={false} />
              <div className="login-led-keywords">
                <span>Marca.</span><span>Alcance.</span><span>Impacto.</span>
              </div>
            </div>

            <div className="login-led-timeline"><span /></div>
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
                  onFocus={() => setCampoEnFoco(true)}
                  onBlur={() => setCampoEnFoco(false)}
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
                  onFocus={() => setCampoEnFoco(true)}
                  onBlur={() => setCampoEnFoco(false)}
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
