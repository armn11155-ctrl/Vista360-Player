import { useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import type { Cliente, Contrato } from "../../types";
import { estadoCampana, panelesDeContrato, rucCliente } from "../../types";
import { auth, cloudFunctions, db, logout } from "../../config/firebase";
import { subirAvatarR2 } from "../../config/r2";
import { comprimirAvatarWebp, type PosicionRecorte } from "../../utils/comprimirImagen";
import { useFacturas } from "../../hooks/useFacturas";
import { BrandThumb } from "../BrandThumb";
import { AvatarUploadModal } from "../AvatarUploadModal";

interface Props {
  cliente: Cliente | null;
  contratos?: Contrato[];
  email: string;
  isAdmin?: boolean;
  /** true cuando quien está REALMENTE conectado es un Gerente/Trabajador
   *  interno, incluso si en este momento está en modo "ver como
   *  cliente" (isAdmin pasa a false en ese modo, pero la sesión de
   *  Firebase Auth sigue siendo la del admin). Sirve para ocultar
   *  "Cambiar contraseña" en ese modo: si se dejara, cambiaría la
   *  contraseña del admin, no la del cliente que está simulando ver
   *  -- un cliente real nunca manda este prop (queda undefined). */
  esInterno?: boolean;
  onCambiarCliente?: () => void;
  onNotifClick?: () => void;
  totalNotifs?: number;
}

type ProfileIcon =
  | "company"
  | "contacts"
  | "bell"
  | "campaign"
  | "clock"
  | "executive"
  | "invoice"
  | "screen"
  | "switch"
  | "logout"
  | "lock";

type MetricTone = "blue" | "green" | "orange";

function Icon({ type }: { type: ProfileIcon }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<ProfileIcon, React.ReactNode> = {
    company: <><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" /><path d="M16 9h2a2 2 0 0 1 2 2v10" /><path d="M8 7h4M8 11h4M8 15h4M9 21v-3h2v3" /></>,
    contacts: <><circle cx="12" cy="8" r="3.4" /><path d="M5.5 21a6.5 6.5 0 0 1 13 0" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    campaign: <><path d="M3 11v3a2 2 0 0 0 2 2h2l6 4V5L7 9H5a2 2 0 0 0-2 2z" /><path d="M16 9a4 4 0 0 1 0 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    executive: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /><path d="M8 9h8M8 13h5" /></>,
    invoice: <><path d="M14 2H6a2 2 0 0 0-2 2v16l3-2 3 2 3-2 3 2 3-2V8z" /><path d="M14 2v6h6" /><path d="M8 12h8M8 16h6" /></>,
    screen: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
    switch: <><path d="M16 3h5v5" /><path d="M21 3l-7 7" /><path d="M8 21H3v-5" /><path d="M3 21l7-7" /></>,
    logout: <><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M21 19V5a2 2 0 0 0-2-2h-5" /></>,
    lock: <><rect x="4.5" y="10.5" width="15" height="9.5" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></>,
  };

  return <svg {...common}>{paths[type]}</svg>;
}

function ProfileRow({ icon, label, value, danger, onClick }: {
  icon: ProfileIcon;
  label: string;
  value?: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="profile-row-icon"><Icon type={icon} /></span>
      <span className="profile-row-label">{label}</span>
      {value && <span className="profile-row-value">{value}</span>}
      {onClick && !danger && (
        <svg className="profile-row-chevron" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
    </>
  );

  if (!onClick && !danger) {
    return <div className="profile-row">{content}</div>;
  }

  return (
    <button type="button" className={`profile-row ${onClick ? "clickable" : ""} ${danger ? "danger" : ""}`} onClick={onClick}>
      {content}
    </button>
  );
}

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="profile-section">
      <h2>{title}</h2>
      <div className="profile-card-list">{children}</div>
    </section>
  );
}

function ProfileMetricRow({ icon, label, value, tone }: {
  icon: ProfileIcon;
  label: string;
  value: string;
  tone: MetricTone;
}) {
  return (
    <div className={`profile-metric-row ${tone}`}>
      <span className="profile-metric-icon"><Icon type={icon} /></span>
      <span className="profile-metric-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function Perfil({ cliente, contratos = [], email, isAdmin, esInterno, onCambiarCliente, onNotifClick, totalNotifs = 0 }: Props) {
  const empresa = cliente?.empresa ?? "Cliente";
  const ruc = rucCliente(cliente);
  const facturasState = useFacturas(ruc, cliente?.id);
  const activas = contratos.filter((contrato) => estadoCampana(contrato) === "Activa").length;
  const pantallas = new Set(contratos.flatMap((contrato) => panelesDeContrato(contrato))).size;
  const facturasPendientes = facturasState.status === "ready"
    ? facturasState.facturas.filter((factura) => factura.estado === "Pendiente" || factura.estado === "Vencida").length
    : 0;
  const pendingAvatarRef = useRef("");
  const [avatarUrl, setAvatarUrl] = useState(cliente?.avatarUrl ?? "");
  const [subiendoAvatar, setSubiendoAvatar] = useState(false);
  const [modalAvatarAbierto, setModalAvatarAbierto] = useState(false);

  // "Cambiar contraseña" -- cada quien cambia SU PROPIA sesion (el
  // cliente la suya, el admin la suya en su propio perfil). Se
  // esconde solo cuando el admin esta navegando "como" un cliente
  // (ver mas abajo): ahi la sesion de Firebase Auth activa sigue
  // siendo la del admin, asi que reautenticar/actualizar aqui
  // cambiaria la contraseña del admin, no la del cliente.
  const [modalPasswordAbierto, setModalPasswordAbierto] = useState(false);
  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [passwordConfirmar, setPasswordConfirmar] = useState("");
  const [cambiandoPassword, setCambiandoPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordExito, setPasswordExito] = useState(false);

  function cerrarModalPassword() {
    setModalPasswordAbierto(false);
    setPasswordActual("");
    setPasswordNueva("");
    setPasswordConfirmar("");
    setPasswordError("");
    setPasswordExito(false);
  }

  function passwordValida(password: string) {
    return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
  }

  async function cambiarPassword() {
    setPasswordError("");
    if (!passwordActual) {
      setPasswordError("Ingresa tu contraseña actual.");
      return;
    }
    if (!passwordValida(passwordNueva)) {
      setPasswordError("La nueva contraseña debe tener mínimo 8 caracteres, con letras y números.");
      return;
    }
    if (passwordNueva !== passwordConfirmar) {
      setPasswordError("Las contraseñas nuevas no coinciden.");
      return;
    }
    const usuario = auth?.currentUser;
    if (!auth || !usuario || !usuario.email) {
      setPasswordError("No se pudo identificar tu sesión. Vuelve a iniciar sesión e intenta de nuevo.");
      return;
    }

    setCambiandoPassword(true);
    try {
      const credencial = EmailAuthProvider.credential(usuario.email, passwordActual);
      await reauthenticateWithCredential(usuario, credencial);
      await updatePassword(usuario, passwordNueva);
      setPasswordExito(true);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      if (code.includes("wrong-password") || code.includes("invalid-credential")) {
        setPasswordError("La contraseña actual no es correcta.");
      } else if (code.includes("weak-password")) {
        setPasswordError("La nueva contraseña es muy débil.");
      } else if (code.includes("too-many-requests")) {
        setPasswordError("Demasiados intentos. Espera un momento y vuelve a intentar.");
      } else if (code.includes("requires-recent-login")) {
        setPasswordError("Tu sesión es muy antigua. Cierra sesión, vuelve a entrar e intenta de nuevo.");
      } else {
        setPasswordError("No se pudo cambiar la contraseña. Intenta de nuevo.");
      }
    } finally {
      setCambiandoPassword(false);
    }
  }

  useEffect(() => {
    if (cliente?.avatarUrl) {
      pendingAvatarRef.current = "";
      setAvatarUrl(cliente.avatarUrl);
      return;
    }

    if (!pendingAvatarRef.current) {
      setAvatarUrl("");
    }
  }, [cliente?.id, cliente?.avatarUrl]);

  async function subirNuevaFoto(file: File, posicion: PosicionRecorte) {
    if (!cliente?.id || !db) {
      throw new Error("No se pudo identificar al cliente.");
    }
    if (!cloudFunctions) {
      throw new Error("Firebase Functions no está configurado.");
    }

    setSubiendoAvatar(true);
    try {
      const webp = await comprimirAvatarWebp(file, posicion);
      const { key: url } = await subirAvatarR2(webp);
      pendingAvatarRef.current = url;
      setAvatarUrl(url);
      const fn = httpsCallable<{ clienteId: string; avatarUrl: string }, { clienteId: string; avatarUrl: string }>(
        cloudFunctions,
        "actualizarAvatarCliente"
      );
      await fn({ clienteId: cliente.id, avatarUrl: url });
    } finally {
      setSubiendoAvatar(false);
    }
  }

  return (
    <div className="profile-screen">
      <header className="profile-top">
        <div className="profile-top-bar">
          <img src="/logo-player.webp" decoding="async" alt="Vista360 Player" className="profile-top-logo" draggable={false} />
          <button type="button" className="profile-bell" aria-label="Notificaciones" onClick={onNotifClick}>
            <Icon type="bell" />
            {totalNotifs > 0 && <span>{totalNotifs > 9 ? "9+" : totalNotifs}</span>}
          </button>
        </div>

        <section className="profile-hero-company">
          <div className="profile-avatar-wrap">
            {isAdmin ? (
              <button
                type="button"
                className="profile-avatar-hover-btn"
                onClick={() => setModalAvatarAbierto(true)}
                disabled={subiendoAvatar}
                aria-label="Cambiar foto de perfil"
              >
                <BrandThumb name={empresa} avatarKey={cliente?.avatarKey} avatarUrl={avatarUrl} size={82} radius={24} iconScale={0.78} priority />
                <span className="profile-avatar-camera-overlay" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
                    <circle cx="12" cy="13" r="3.4" />
                  </svg>
                </span>
              </button>
            ) : (
              <BrandThumb name={empresa} avatarKey={cliente?.avatarKey} avatarUrl={avatarUrl} size={82} radius={24} iconScale={0.78} priority />
            )}
          </div>
          <div className="profile-company-copy">
            <h1>{empresa}</h1>
            <p>{email || cliente?.email || "Cliente Vista360"}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="profile-verified">
                <span className="profile-verified-mark" aria-hidden="true">
                  <img src="/verified-check.svg" decoding="async" alt="" draggable={false} />
                </span>
                <span>Cuenta verificada</span>
              </span>
            </div>
          </div>
        </section>

        <span className="profile-top-curve" aria-hidden="true">
          <svg viewBox="0 0 438 34" preserveAspectRatio="none">
            <defs>
              <linearGradient id="profile-top-curve-gradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#2f6fed" />
                <stop offset="0.5" stopColor="#5b93ff" />
                <stop offset="1" stopColor="#2f6fed" />
              </linearGradient>
              <linearGradient id="profile-top-curve-shine-gradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
                <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.96" />
                <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
              </linearGradient>
              <mask id="profile-top-curve-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="438" height="34">
                <path d="M0 2 C48 2 42 31 106 31 H332 C396 31 390 2 438 2" fill="none" stroke="#FFFFFF" strokeWidth="3" />
              </mask>
            </defs>
            <path
              className="profile-top-curve-cutout"
              d="M0 2 C48 2 42 31 106 31 H332 C396 31 390 2 438 2 V34 H0 Z"
            />
            <path className="profile-top-curve-base" d="M0 2 C48 2 42 31 106 31 H332 C396 31 390 2 438 2" />
            <g mask="url(#profile-top-curve-mask)">
              <rect className="profile-top-curve-shine" x="-196" y="0" width="196" height="34" fill="url(#profile-top-curve-shine-gradient)" />
            </g>
          </svg>
        </span>

      </header>

      {modalAvatarAbierto && (
        <AvatarUploadModal onSubir={subirNuevaFoto} onCerrar={() => setModalAvatarAbierto(false)} />
      )}

      {modalPasswordAbierto && (
        <div
          // Se pidio que el modal solo se cierre con el boton "Cancelar"
          // (o "Listo" tras exito), no al hacer clic afuera -- para que
          // no se pierda sin querer lo que el cliente ya escribio.
          style={{
            position: "fixed", inset: 0, background: "rgba(13,22,41,0.55)", zIndex: 500,
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#fff", borderRadius: "20px 20px 0 0", padding: "22px 20px",
              width: "100%", maxWidth: 480, boxShadow: "0 -8px 30px rgba(0,0,0,0.2)", boxSizing: "border-box",
            }}
          >
            {passwordExito ? (
              <>
                <div style={{ textAlign: "center", marginBottom: 6 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: "50%", background: "rgba(34,197,94,0.12)",
                    display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px",
                  }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0B1220", marginBottom: 6, textAlign: "center" }}>
                    Contraseña actualizada
                  </div>
                  <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5, marginBottom: 20, textAlign: "center" }}>
                    Tu contraseña se cambió correctamente. La próxima vez que inicies sesión, usa la nueva.
                  </div>
                </div>
                <button type="button"
                  onClick={cerrarModalPassword}
                  style={{
                    width: "100%", padding: "14px", background: "#0877FF", border: "none", borderRadius: 12,
                    color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
                  }}
                >
                  Listo
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#0B1220", marginBottom: 6 }}>
                  Cambiar contraseña
                </div>
                <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5, marginBottom: 16 }}>
                  Por seguridad, primero confirma tu contraseña actual.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: passwordError ? 10 : 18 }}>
                  <input
                    type="password"
                    value={passwordActual}
                    onChange={(e) => setPasswordActual(e.target.value)}
                    placeholder="Contraseña actual"
                    autoComplete="current-password"
                    disabled={cambiandoPassword}
                    style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 12, padding: "12px", boxSizing: "border-box", fontSize: 14 }}
                  />
                  <input
                    type="password"
                    value={passwordNueva}
                    onChange={(e) => setPasswordNueva(e.target.value)}
                    placeholder="Nueva contraseña (mín. 8, letras y números)"
                    autoComplete="new-password"
                    disabled={cambiandoPassword}
                    style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 12, padding: "12px", boxSizing: "border-box", fontSize: 14 }}
                  />
                  <input
                    type="password"
                    value={passwordConfirmar}
                    onChange={(e) => setPasswordConfirmar(e.target.value)}
                    placeholder="Confirmar nueva contraseña"
                    autoComplete="new-password"
                    disabled={cambiandoPassword}
                    style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 12, padding: "12px", boxSizing: "border-box", fontSize: 14 }}
                  />
                </div>
                {passwordError && (
                  <div style={{ color: "#DC2626", fontSize: 13, marginBottom: 14, lineHeight: 1.4 }}>{passwordError}</div>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button"
                    onClick={cerrarModalPassword}
                    disabled={cambiandoPassword}
                    style={{
                      flex: 1, padding: "14px", background: "#F3F4F6", border: "none", borderRadius: 12,
                      color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer",
                    }}
                  >
                    Cancelar
                  </button>
                  <button type="button"
                    onClick={cambiarPassword}
                    disabled={cambiandoPassword}
                    style={{
                      flex: 1, padding: "14px", background: "#0877FF", border: "none", borderRadius: 12,
                      color: "#fff", fontWeight: 700, fontSize: 14,
                      cursor: cambiandoPassword ? "not-allowed" : "pointer",
                    }}
                  >
                    {cambiandoPassword ? "Guardando…" : "Guardar contraseña"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <main className="profile-content">
        <ProfileSection title="Información de la empresa">
          <ProfileRow icon="company" label="RUC cliente" value={ruc || "Por registrar"} />
          <ProfileRow icon="contacts" label="Contacto principal" value={cliente?.contacto || email || "Por registrar"} />
          {/* Se muestra para el cliente real, y tambien para el admin en
              SU PROPIO perfil (para que pueda cambiar su propia
              contraseña). Lo unico que se esconde es el modo "ver
              como cliente" del admin -- ahi isAdmin pasa a false
              (para que se vea la pantalla de cliente), pero la sesion
              de Firebase Auth activa sigue siendo la del admin: si se
              dejara, "cambiar contraseña" cambiaria la del admin
              creyendo que se cambia la de un cliente. esInterno
              detecta ese modo aunque isAdmin diga false; isAdmin
              true dentro de esInterno es justamente "admin viendo su
              propio perfil", asi que ahi si se muestra. */}
          {(!esInterno || isAdmin) && <ProfileRow icon="lock" label="Cambiar contraseña" onClick={() => setModalPasswordAbierto(true)} />}
          {isAdmin && <ProfileRow icon="switch" label="Cambiar cliente" onClick={onCambiarCliente} />}
        </ProfileSection>

        <ProfileSection title="Resumen de cuenta">
          <div className="profile-metric-card">
            <ProfileMetricRow icon="campaign" label="Campañas activas" value={String(activas)} tone="blue" />
            <ProfileMetricRow icon="screen" label="Pantallas contratadas" value={String(pantallas)} tone="green" />
            <ProfileMetricRow icon="invoice" label="Facturas pendientes" value={String(facturasPendientes)} tone="orange" />
          </div>
        </ProfileSection>

        <ProfileSection title="Cuenta">
          <ProfileRow icon="logout" label="Cerrar sesión" danger onClick={() => logout()} />
        </ProfileSection>
      </main>
    </div>
  );
}
