import { useEffect, useRef, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import type { Cliente, Contrato } from "../../types";
import { estadoCampana } from "../../types";
import { db, logout } from "../../config/firebase";
import { subirAvatarCloudinary } from "../../config/cloudinary";
import { comprimirAvatarWebp } from "../../utils/comprimirImagen";
import { useFacturas } from "../../hooks/useFacturas";
import { BrandThumb } from "../BrandThumb";

interface Props {
  cliente: Cliente | null;
  contratos?: Contrato[];
  email: string;
  isAdmin?: boolean;
  onCambiarCliente?: () => void;
  onContactanos?: () => void;
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
  | "logout";

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

export default function Perfil({ cliente, contratos = [], email, isAdmin, onCambiarCliente, onContactanos }: Props) {
  const empresa = cliente?.empresa ?? "Cliente";
  const ejecutivo = cliente?.ejecutivo ?? "Vista360";
  const facturasState = useFacturas(cliente?.ruc);
  const activas = contratos.filter((contrato) => estadoCampana(contrato) === "Activa").length;
  const pantallas = new Set(contratos.map((contrato) => contrato.panel_id)).size;
  const facturasPendientes = facturasState.status === "ready"
    ? facturasState.facturas.filter((factura) => factura.estado === "Pendiente" || factura.estado === "Vencida").length
    : 0;
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(cliente?.avatarUrl ?? "");
  const [subiendoAvatar, setSubiendoAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  useEffect(() => {
    setAvatarUrl(cliente?.avatarUrl ?? "");
    setAvatarError("");
  }, [cliente?.id, cliente?.avatarUrl]);

  async function cambiarFotoPerfil(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !cliente?.id || !db) return;

    setAvatarError("");
    setSubiendoAvatar(true);
    try {
      const webp = await comprimirAvatarWebp(file);
      const url = await subirAvatarCloudinary(webp);
      await updateDoc(doc(db, "clientes", cliente.id), { avatarUrl: url, avatarKey: "custom" });
      setAvatarUrl(url);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "No se pudo cambiar la foto.");
    } finally {
      setSubiendoAvatar(false);
    }
  }

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
          <div className="profile-avatar-wrap">
            <BrandThumb name={empresa} avatarKey={cliente?.avatarKey} avatarUrl={avatarUrl} size={64} radius={32} iconScale={0.82} />
            {isAdmin && (
              <>
                <input ref={fileRef} type="file" accept="image/*" className="profile-avatar-input" onChange={cambiarFotoPerfil} />
                <button
                  type="button"
                  className="profile-avatar-edit"
                  onClick={() => !subiendoAvatar && fileRef.current?.click()}
                  disabled={subiendoAvatar}
                >
                  {subiendoAvatar ? "..." : "Cambiar"}
                </button>
              </>
            )}
          </div>
          <div className="profile-company-copy">
            <h1>{empresa}</h1>
            <p>{email || cliente?.email || "Cliente desde Enero 2024"}</p>
            <span className="profile-verified">Cuenta verificada</span>
            {isAdmin && avatarError && <div className="profile-avatar-error">{avatarError}</div>}
          </div>
        </section>

        <ProfileSection title="Información útil">
          <ProfileRow icon="company" label="RUC" value={cliente?.ruc || "Por registrar"} />
          <ProfileRow icon="contacts" label="Contacto principal" value={cliente?.contacto || email || "Por registrar"} />
          <ProfileRow icon="executive" label="Ejecutivo asignado" value={ejecutivo} />
          {isAdmin && <ProfileRow icon="switch" label="Cambiar cliente" onClick={onCambiarCliente} />}
        </ProfileSection>

        <ProfileSection title="Resumen de cuenta">
          <ProfileRow icon="campaign" label="Campañas activas" value={String(activas)} />
          <ProfileRow icon="screen" label="Pantallas contratadas" value={String(pantallas)} />
          <ProfileRow icon="invoice" label="Facturas pendientes" value={String(facturasPendientes)} />
          <ProfileRow icon="clock" label="Ciudad principal" value={cliente?.ciudad || "Lima"} />
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
