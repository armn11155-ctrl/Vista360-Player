import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import BackChevron from "../BackChevron";
import { useInvitaciones } from "../../hooks/useInvitaciones";
import { useClientesAdmin } from "../../hooks/useClientesAdmin";
import { BrandThumb } from "../BrandThumb";
import { ClientAvatarPicker } from "../ClientAvatarPicker";
import { subirAvatarCloudinary } from "../../config/cloudinary";
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

export default function Accesos({ onBack }: Props) {
  const state = useInvitaciones(true);
  const clientesState = useClientesAdmin();
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [email, setEmail] = useState("");
  const [contacto, setContacto] = useState("");
  const [celular, setCelular] = useState("");
  const [avatarKey, setAvatarKey] = useState("tower");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [subiendoAvatar, setSubiendoAvatar] = useState(false);
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState("");
  const [accesoCreado, setAccesoCreado] = useState<{ empresa: string; email: string; password: string } | null>(null);

  async function copiar(id: string, link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiadoId(id);
      setTimeout(() => setCopiadoId((c) => (c === id ? null : c)), 2000);
    } catch {
      // si falla el portapapeles, igual queda el link visible para seleccionar a mano
    }
  }

  const invitaciones = state.status === "ready" ? state.invitaciones : [];
  const clientes = clientesState.status === "ready" ? clientesState.clientes : [];
  const clienteSeleccionado = clientes.find((c) => c.id === clienteId);

  async function subirAvatar(file: File) {
    setSubiendoAvatar(true);
    setErrorCrear("");
    try {
      const webp = await comprimirAvatarWebp(file);
      const url = await subirAvatarCloudinary(webp);
      setAvatarUrl(url);
    } catch (err) {
      setErrorCrear(err instanceof Error ? err.message : "No se pudo preparar el avatar.");
    } finally {
      setSubiendoAvatar(false);
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
        { clienteId: string; email: string; contacto: string; celular: string; avatarKey: string; avatarUrl: string },
        { clienteId: string; empresa: string; email: string; password: string }
      >(cloudFunctions, "crearClienteAcceso");
      const res = await fn({ clienteId, email: email.trim(), contacto: contacto.trim(), celular: celular.trim(), avatarKey, avatarUrl });
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
    <div>
      <div className="detail-header">
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Usuarios</div>
        <div style={{ width: 32 }} />
      </div>

      <div className="content-area">
        <div className="card" style={{ background: "rgba(59,130,246,0.12)" }}>
          <div style={{ fontSize: 12.5, color: "#1D4ED8", lineHeight: 1.5 }}>
            Aquí administras los usuarios del portal. Cada usuario queda vinculado a un cliente
            existente de tu base de datos mediante su <strong>clienteId</strong>.
          </div>
        </div>

        <button
          onClick={() => setMostrarForm((v) => !v)}
          style={{
            width: "100%", margin: "12px 0", background: "#2563EB", color: "#fff",
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
              style={{ width: "100%", marginTop: 12, background: creando || subiendoAvatar ? "#93C5FD" : "#0D1629", color: "#fff", border: "none", borderRadius: 10, padding: "12px", fontWeight: 800, cursor: creando || subiendoAvatar ? "not-allowed" : "pointer" }}
            >
              {creando ? "Creando..." : subiendoAvatar ? "Preparando avatar..." : "Crear usuario y contraseña"}
            </button>
            {accesoCreado && (
              <div style={{ marginTop: 12, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.18)", borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, color: "#16A34A", fontWeight: 800, marginBottom: 8 }}>Usuario creado</div>
                <div style={{ fontSize: 12, whiteSpace: "pre-wrap", color: "var(--text)", lineHeight: 1.45 }}>{mensajeAcceso}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <a href={`https://wa.me/${celular.replace(/\D/g, "")}?text=${encodeURIComponent(mensajeAcceso)}`} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: "center", background: "#22C55E", color: "#fff", borderRadius: 10, padding: "10px", fontWeight: 800, fontSize: 12, textDecoration: "none" }}>WhatsApp</a>
                  <a href={`mailto:${accesoCreado.email}?subject=${encodeURIComponent("Acceso a Vista360 Player")}&body=${encodeURIComponent(mensajeAcceso)}`} style={{ flex: 1, textAlign: "center", background: "#3B82F6", color: "#fff", borderRadius: 10, padding: "10px", fontWeight: 800, fontSize: 12, textDecoration: "none" }}>Correo</a>
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
        {state.status === "ready" && invitaciones.length === 0 && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center" }}>
            Aún no se ha creado ningún usuario.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {invitaciones.map((inv) => {
            const yaCopiado = copiadoId === inv.id;
            const whatsappHref = `https://wa.me/?text=${encodeURIComponent(
              `Hola, aquí tienes tu acceso a Vista360 Player. Crea tu contraseña con este link: ${inv.link}`
            )}`;
            return (
              <div className="card" key={inv.id}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
                  <BrandThumb name={inv.clienteNombre || inv.email} avatarKey={inv.avatarKey} avatarUrl={inv.avatarUrl} size={38} radius={10} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                      {inv.clienteNombre || inv.email}
                      {inv.esAdmin && (
                        <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#7C3AED", background: "rgba(139,92,246,0.12)", padding: "2px 6px", borderRadius: 20 }}>
                          ADMIN
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>{inv.email}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{fmtFecha(inv)}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => copiar(inv.id, inv.link)}
                    style={{
                      flex: 1, background: yaCopiado ? "rgba(34,197,94,0.12)" : "var(--accent)",
                      color: yaCopiado ? "var(--green)" : "#fff", border: "none", borderRadius: 10,
                      padding: "10px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    {yaCopiado ? "✓ Copiado" : "📋 Copiar link"}
                  </button>
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)",
                      borderRadius: 10, padding: "10px 14px", color: "#16A34A", fontSize: 12.5,
                      fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center",
                    }}
                  >
                    💬
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
