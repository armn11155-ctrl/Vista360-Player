import type { Cliente } from "../../types";
import { logout } from "../../config/firebase";
import { BrandThumb } from "../BrandThumb";

interface Props {
  cliente: Cliente | null;
  email: string;
  isAdmin?: boolean;
  onCambiarCliente?: () => void;
  onContactanos?: () => void;
}

type ProfileIcon =
  | "company"
  | "contacts"
  | "bell"
  | "language"
  | "clock"
  | "executive"
  | "switch"
  | "logout";

function Icon({ type }: { type: ProfileIcon }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<ProfileIcon, React.ReactNode> = {
    company: <><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" /><path d="M16 9h2a2 2 0 0 1 2 2v10" /><path d="M8 7h4M8 11h4M8 15h4M9 21v-3h2v3" /></>,
    contacts: <><circle cx="12" cy="8" r="3.4" /><path d="M5.5 21a6.5 6.5 0 0 1 13 0" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    language: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    executive: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /><path d="M8 9h8M8 13h5" /></>,
    switch: <><path d="M16 3h5v5" /><path d="M21 3l-7 7" /><path d="M8 21H3v-5" /><path d="M3 21l7-7" /></>,
    logout: <><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M21 19V5a2 2 0 0 0-2-2h-5" /></>,
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

export default function Perfil({ cliente, email, isAdmin, onCambiarCliente, onContactanos }: Props) {
  const empresa = cliente?.empresa ?? "Cliente";
  const ejecutivo = cliente?.ejecutivo ?? "Vista360";

  return (
    <div className="profile-screen">
      <header className="profile-top">
        <div className="profile-top-spacer" />
        <img src="/logo-player.png" alt="Vista360 Player" className="profile-top-logo" draggable={false} />
        <button type="button" className="profile-bell" aria-label="Notificaciones">
          <Icon type="bell" />
          <span>1</span>
        </button>
      </header>

      <main className="profile-content">
        <section className="profile-company-card">
          <BrandThumb name={empresa} avatarKey={cliente?.avatarKey} avatarUrl={cliente?.avatarUrl} size={64} radius={32} iconScale={0.82} />
          <div className="profile-company-copy">
            <h1>{empresa}</h1>
            <p>{email || cliente?.email || "Cliente desde Enero 2024"}</p>
            <span className="profile-verified">Cuenta verificada</span>
          </div>
        </section>

        <ProfileSection title="Información de la empresa">
          <ProfileRow icon="company" label="Datos de la empresa" value={cliente?.ciudad} />
          <ProfileRow icon="contacts" label="Contactos" value={cliente?.contacto} />
          {isAdmin && <ProfileRow icon="switch" label="Cambiar cliente" onClick={onCambiarCliente} />}
        </ProfileSection>

        <ProfileSection title="Preferencias">
          <ProfileRow icon="language" label="Idioma" value="Español / Inglés" />
          <ProfileRow icon="clock" label="Zona horaria" value="Lima" />
        </ProfileSection>

        <ProfileSection title="Soporte">
          <ProfileRow icon="executive" label="Contáctanos" value={ejecutivo} onClick={onContactanos} />
        </ProfileSection>

        <div className="profile-logout-card">
          <ProfileRow icon="logout" label="Cerrar sesión" danger onClick={() => logout()} />
        </div>
      </main>
    </div>
  );
}
