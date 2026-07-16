import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import BackChevron from "../BackChevron";
import { useInvitaciones } from "../../hooks/useInvitaciones";
import type { InvitacionPortal } from "../../hooks/useInvitaciones";
import { useClientesAdmin } from "../../hooks/useClientesAdmin";
import { BrandThumb } from "../BrandThumb";
import { ClientAvatarPicker } from "../ClientAvatarPicker";
import { subirAvatarR2 } from "../../config/r2";
import { cloudFunctions } from "../../config/firebase";
import { comprimirAvatarWebp } from "../../utils/comprimirImagen";

interface Props {
  onBack: () => void;
}

function fmtFecha(inv: { createdAt?: { toDate: () => Date } | null }): string {
  const d = inv.createdAt?.toDate?.();
  if (!d) return "—";
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

function MenuButton({ label, onClick, danger, disabled }: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%", border: "none", background: "transparent", borderRadius: 9,
        padding: "10px 11px", textAlign: "left", fontSize: 12.5, fontWeight: 800,
        color: disabled ? "#CBD5E1" : danger ? "#DC2626" : "#0F172A",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

function MenuLink({ label, href, disabled }: { label: string; href: string; disabled?: boolean }) {
  if (disabled) {
    return <MenuButton label={label} onClick={() => undefined} disabled />;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "block", borderRadius: 9, padding: "10px 11px", textAlign: "left",
        fontSize: 12.5, fontWeight: 800, color: "#0F172A", textDecoration: "none",
      }}
    >
      {label}
    </a>
  );
}

export default function Accesos({ onBack }: Props) {
  const state = useInvitaciones(true);
  const clientesState = useClientesAdmin();
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [menuAbierto, setMenuAbierto] = useState<string | null>(null);
  const [tab, setTab] = useState<"activos" | "archivados">("activos");
  const [accionandoId, setAccionandoId] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [contacto, setContacto] = useState("");
  const [celular, setCelular] = useState("");
  const [avatarKey, setAvatarKey] = useState("tower");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [subiendoAvatar, setSubiendoAvatar] = useState(false);
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState("");
  const [accesoCreado, setAccesoCreado] = useState<{ empresa: string; email: string; password: string } | null>(null);

  async function copiar(id: string, link: string) {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiadoId(id);
      setTimeout(() => setCopiadoId((c) => (c === id ? null : c)), 2000);
    } catch {
      // si falla el portapapeles, igual queda el link visible para seleccionar a mano
    }
  }

  const invitaciones = state.status === "ready" ? state.invitaciones : [];
  const usuariosActivos = invitaciones.filter((inv) => !inv.archived);
  const usuariosArchivados = invitaciones.filter((inv) => !!inv.archived);
  const usuariosVisibles = tab === "activos" ? usuariosActivos : usuariosArchivados;
  const clientes = clientesState.status === "ready" ? clientesState.clientes : [];
  const clienteSeleccionado = clientes.find((c) => c.id === clienteId);

  async function subirAvatar(file: File) {
    setSubiendoAvatar(true);
    setErrorCrear("");
    try {
      const webp = await comprimirAvatarWebp(file);
      const { key: url } = await subirAvatarR2(webp);
      setAvatarUrl(url);
    } catch (err) {
      setErrorCrear(err instanceof Error ? err.message : "No se pudo preparar el avatar.");
    } finally {
      setSubiendoAvatar(false);
    }
  }

  async function administrarUsuario(inv: InvitacionPortal, accion: "archivar" | "restaurar" | "eliminar") {
    if (!cloudFunctions) {
      setErrorCrear("Firebase Functions no está configurado.");
      return;
    }

    const nombre = inv.clienteNombre || inv.email;
    const confirmado =
      accion === "archivar"
        ? window.confirm(`¿Seguro que quieres archivar el usuario de ${nombre}? No podrá entrar hasta que lo restaures.`)
        : accion === "eliminar"
          ? window.confirm(`¿Seguro que quieres eliminar definitivamente el usuario de ${nombre}? Esta acción no se puede deshacer.`)
          : true;
    if (!confirmado) return;

    setAccionandoId(inv.id);
    setMenuAbierto(null);
    setErrorCrear("");
    try {
      const fn = httpsCallable<
        { invitacionId: string; uid?: string; email: string; accion: "archivar" | "restaurar" | "eliminar" },
        { ok: boolean }
      >(cloudFunctions, "administrarUsuarioPortal");
      await fn({ invitacionId: inv.id, uid: inv.uid, email: inv.email, accion });
    } catch (err) {
      setErrorCrear(err instanceof Error ? err.message : "No se pudo actualizar el usuario.");
    } finally {
      setAccionandoId(null);
    }
  }

  async function crearUsuario() {
    if (!cloudFunctions) {
      setErrorCrear("Firebase Functions no está configurado.");
      return;
    }
    if (!clienteId || !email.trim()) {
      setErrorCrear("Selecciona un cliente y escribe el correo.");
      return;
    }
    setCreando(true);
    setErrorCrear("");
    setAccesoCreado(null);
    try {
      const fn = httpsCallable<
        { clienteId: string; email: string; password: string; contacto: string; celular: string; avatarKey: string; avatarUrl: string },
        { clienteId: string; empresa: string; email: string; password: string }
      >(cloudFunctions, "crearClienteAcceso");
      const res = await fn({ clienteId, email: email.trim(), password: password.trim(), contacto: contacto.trim(), celular: celular.trim(), avatarKey, avatarUrl });
      setAccesoCreado(res.data);
    } catch (err) {
      setErrorCrear(err instanceof Error ? err.message : "No se pudo crear el usuario.");
    } finally {
      setCreando(false);
    }
  }

  const mensajeAcceso = accesoCreado
    ? [
        `Hola ${contacto || accesoCreado.empresa}, te mando tu acceso a Vista360 Player.`,
        "",
        "Ya puedes entrar a tu portal para ver campañas, cobertura, reportes y descargas.",
        "",
        `Portal: ${window.location.origin}`,
        `Correo: ${accesoCreado.email}`,
        `Contraseña temporal: ${accesoCreado.password}`,
        "",
        "Por seguridad, te recomendamos cambiar la contraseña después del primer ingreso.",
      ].join("\n")
    : "";

  return (
    <div className="admin-tool-screen accesos-screen">
      <div className="detail-header">
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Usuarios</div>
        <div style={{ width: 32 }} />
      </div>

      <div className="content-area">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          {[
            { id: "activos" as const, label: "Activos", count: usuariosActivos.length },
            { id: "archivados" as const, label: "Archivados", count: usuariosArchivados.length },
          ].map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                style={{
                  border: active ? "1px solid #0877FF" : "1px solid #E5E7EB",
                  background: active ? "rgba(8,119,255,0.09)" : "#fff",
                  color: active ? "#0877FF" : "#64748B",
                  borderRadius: 12,
                  minHeight: 42,
                  fontSize: 12.5,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {item.label} <span style={{ color: active ? "#0B3F8A" : "#94A3B8" }}>{item.count}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setMostrarForm((v) => !v)}
          style={{
            width: "100%", margin: "12px 0", background: "#0877FF", color: "#fff",
            border: "none", borderRadius: 12, padding: "13px", fontSize: 13,
            fontWeight: 800, cursor: "pointer",
          }}
        >
          {mostrarForm ? "Cerrar formulario" : "+ Agregar usuario"}
        </button>

        {mostrarForm && (
          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", marginBottom: 10 }}>
              Nuevo usuario
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <select
                value={clienteId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setClienteId(nextId);
                  const nextCliente = clientes.find((c) => c.id === nextId);
                  if (nextCliente?.avatarKey) setAvatarKey(nextCliente.avatarKey);
                  setAvatarUrl(nextCliente?.avatarUrl ?? "");
                }}
                style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 10, padding: "11px", color: "var(--text)", background: "#fff" }}
              >
                <option value="">Seleccionar cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.empresa}</option>
                ))}
              </select>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo del usuario" style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 10, padding: "11px", boxSizing: "border-box" }} />
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña inicial (opcional)" style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 10, padding: "11px", boxSizing: "border-box" }} />
              <input value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="Nombre/contacto" style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 10, padding: "11px", boxSizing: "border-box" }} />
              <input value={celular} onChange={(e) => setCelular(e.target.value)} placeholder="WhatsApp" style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 10, padding: "11px", boxSizing: "border-box" }} />
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 800, marginBottom: 8 }}>Avatar del cliente</div>
                <ClientAvatarPicker
                  name={clienteSeleccionado?.empresa || contacto || email || "Cliente"}
                  value={avatarKey}
                  onChange={(value) => {
                    setAvatarKey(value);
                    setAvatarUrl("");
                  }}
                  avatarUrl={avatarUrl}
                  onAvatarFile={(file) => void subirAvatar(file)}
                  uploading={subiendoAvatar}
                />
              </div>
            </div>
            {errorCrear && (
              <div style={{ color: "#DC2626", fontSize: 12, marginTop: 10 }}>{errorCrear}</div>
            )}
            <button
              onClick={crearUsuario}
              disabled={creando || subiendoAvatar}
              style={{ width: "100%", marginTop: 12, background: creando || subiendoAvatar ? "#93C5FD" : "#0B1220", color: "#fff", border: "none", borderRadius: 10, padding: "12px", fontWeight: 800, cursor: creando || subiendoAvatar ? "not-allowed" : "pointer" }}
            >
              {creando ? "Creando..." : subiendoAvatar ? "Preparando avatar..." : "Crear usuario y contraseña"}
            </button>
            {accesoCreado && (
              <div style={{ marginTop: 12, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.18)", borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, color: "#16A34A", fontWeight: 800, marginBottom: 8 }}>Usuario creado</div>
                <div style={{ fontSize: 12, whiteSpace: "pre-wrap", color: "var(--text)", lineHeight: 1.45 }}>{mensajeAcceso}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <a href={`https://wa.me/${celular.replace(/\D/g, "")}?text=${encodeURIComponent(mensajeAcceso)}`} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: "center", background: "#22C55E", color: "#fff", borderRadius: 10, padding: "10px", fontWeight: 800, fontSize: 12, textDecoration: "none" }}>WhatsApp</a>
                  <a href={`mailto:${accesoCreado.email}?subject=${encodeURIComponent("Acceso a Vista360 Player")}&body=${encodeURIComponent(mensajeAcceso)}`} style={{ flex: 1, textAlign: "center", background: "#0877FF", color: "#fff", borderRadius: 10, padding: "10px", fontWeight: 800, fontSize: 12, textDecoration: "none" }}>Correo</a>
                </div>
              </div>
            )}
          </div>
        )}

        {state.status === "loading" && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center" }}>Cargando…</div>
        )}
        {state.status === "error" && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center", color: "var(--red)" }}>
            {state.message}
          </div>
        )}
        {state.status === "ready" && usuariosVisibles.length === 0 && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center" }}>
            {tab === "activos" ? "Aún no hay usuarios activos." : "No hay usuarios archivados."}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {usuariosVisibles.map((inv) => {
            const yaCopiado = copiadoId === inv.id;
            const whatsappHref = `https://wa.me/?text=${encodeURIComponent(
              `Hola, aquí tienes tu acceso a Vista360 Player. Crea tu contraseña con este link: ${inv.link}`
            )}`;
            return (
              <div className="card" key={inv.id} style={{ padding: 12, position: "relative" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <BrandThumb name={inv.clienteNombre || inv.email} avatarKey={inv.avatarKey} avatarUrl={inv.avatarUrl} size={42} radius={12} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                      {inv.clienteNombre || inv.email}
                      {inv.esAdmin && (
                        <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#0B3F8A", background: "rgba(8,119,255,0.12)", padding: "2px 6px", borderRadius: 20 }}>
                          ADMIN
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>{inv.email}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{fmtFecha(inv)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMenuAbierto((id) => id === inv.id ? null : inv.id)}
                    style={{
                      width: 34, height: 34, borderRadius: 17, border: "1px solid #E5E7EB",
                      background: "#fff", color: "#64748B", fontSize: 18, fontWeight: 900,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", flexShrink: 0, lineHeight: 1,
                    }}
                    aria-label="Opciones del usuario"
                  >
                    ⋯
                  </button>
                </div>
                {accionandoId === inv.id && (
                  <div style={{ marginTop: 9, fontSize: 11.5, color: "#64748B", fontWeight: 700 }}>
                    Actualizando...
                  </div>
                )}
                {yaCopiado && (
                  <div style={{ marginTop: 9, fontSize: 11.5, color: "#16A34A", fontWeight: 800 }}>
                    Link copiado
                  </div>
                )}
                {menuAbierto === inv.id && (
                  <div
                    style={{
                      position: "absolute", top: 52, right: 12, zIndex: 20, minWidth: 178,
                      background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12,
                      boxShadow: "0 18px 38px rgba(15,23,42,0.16)", padding: 6,
                    }}
                  >
                    {tab === "activos" ? (
                      <>
                        <MenuButton label="Copiar link" onClick={() => copiar(inv.id, inv.link)} disabled={!inv.link} />
                        <MenuLink label="Enviar por WhatsApp" href={whatsappHref} disabled={!inv.link} />
                        <MenuButton label="Archivar usuario" danger onClick={() => administrarUsuario(inv, "archivar")} />
                      </>
                    ) : (
                      <>
                        <MenuButton label="Restaurar usuario" onClick={() => administrarUsuario(inv, "restaurar")} />
                        <MenuButton label="Eliminar definitivo" danger onClick={() => administrarUsuario(inv, "eliminar")} />
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
