import { useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { cloudFunctions } from "../../config/firebase";
import type { Cliente } from "../../types";
import BackChevron from "../BackChevron";
import { ClientAvatarPicker } from "../ClientAvatarPicker";
import { subirAvatarCloudinary } from "../../config/cloudinary";
import { comprimirAvatarWebp } from "../../utils/comprimirImagen";

interface Props {
  cliente: Cliente | null;
  clienteId: string;
  onBack: () => void;
}

interface CrearClienteResponse {
  clienteId: string;
  empresa: string;
  email: string;
  password: string;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#fff",
  border: "1.5px solid #E5E7EB",
  borderRadius: 12,
  padding: "12px 13px",
  fontSize: 14,
  color: "#0D1629",
  boxSizing: "border-box",
  outline: "none",
};

function portalUrl() {
  return window.location.origin;
}

export default function CrearCliente({ cliente, clienteId, onBack }: Props) {
  const [email, setEmail] = useState(cliente?.email ?? "");
  const [contacto, setContacto] = useState(cliente?.contacto ?? "");
  const [celular, setCelular] = useState(cliente?.celular ?? "");
  const [avatarKey, setAvatarKey] = useState(cliente?.avatarKey ?? "tower");
  const [avatarUrl, setAvatarUrl] = useState(cliente?.avatarUrl ?? "");
  const [subiendoAvatar, setSubiendoAvatar] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<CrearClienteResponse | null>(null);

  const mensaje = useMemo(() => {
    if (!resultado) return "";
    return [
      `Hola ${contacto || resultado.empresa}, te mando tu acceso a Vista360 Player.`,
      "",
      "Ya puedes entrar a tu portal para ver campañas, cobertura, reportes y descargas.",
      "",
      `Portal: ${portalUrl()}`,
      `Correo: ${resultado.email}`,
      `Contraseña temporal: ${resultado.password}`,
      "",
      "Por seguridad, te recomendamos cambiar la contraseña después del primer ingreso.",
    ].join("\n");
  }, [contacto, resultado]);

  async function subirAvatar(file: File) {
    setSubiendoAvatar(true);
    setError("");
    try {
      const webp = await comprimirAvatarWebp(file);
      const url = await subirAvatarCloudinary(webp);
      setAvatarUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo preparar el avatar.");
    } finally {
      setSubiendoAvatar(false);
    }
  }

  async function crear() {
    if (!cloudFunctions) {
      setError("Firebase Functions no está configurado.");
      return;
    }
    if (!clienteId || !email.trim()) {
      setError("Selecciona un cliente y escribe el correo del usuario.");
      return;
    }
    setError("");
    setCreando(true);
    try {
      const fn = httpsCallable<
        { clienteId: string; email: string; contacto: string; celular: string; avatarKey: string; avatarUrl: string },
        CrearClienteResponse
      >(cloudFunctions, "crearClienteAcceso");
      const res = await fn({
        clienteId,
        email: email.trim(),
        contacto: contacto.trim(),
        celular: celular.trim(),
        avatarKey,
        avatarUrl,
      });
      setResultado(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el usuario.");
    } finally {
      setCreando(false);
    }
  }

  const whatsappHref = resultado
    ? `https://wa.me/${celular.replace(/\D/g, "")}?text=${encodeURIComponent(mensaje)}`
    : "#";
  const mailHref = resultado
    ? `mailto:${resultado.email}?subject=${encodeURIComponent("Acceso a Vista360 Player")}&body=${encodeURIComponent(mensaje)}`
    : "#";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8FAFD" }}>
      <div style={{ background: "#0D1629", padding: "calc(18px + env(safe-area-inset-top)) 20px 16px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={onBack} style={{ background: "none", border: "none", padding: 6, marginLeft: -6, cursor: "pointer", display: "flex" }}>
            <BackChevron />
          </button>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>Crear usuario</div>
          <div style={{ width: 34 }} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16, WebkitOverflowScrolling: "touch" as any }}>
        <div style={{ background: "#fff", border: "1px solid #E8EDF5", borderRadius: 16, padding: 16, boxShadow: "0 10px 24px rgba(15,23,42,0.045)" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#08122B", marginBottom: 4 }}>Usuario del cliente</div>
          <div style={{ fontSize: 12.5, color: "#6B7280", marginBottom: 16 }}>
            Cliente seleccionado: <strong style={{ color: "#0D1629" }}>{cliente?.empresa ?? "Cliente actual"}</strong>. Aquí sólo se crea el acceso al portal.
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ fontSize: 12, color: "#475569", fontWeight: 700 }}>
              Correo del usuario
              <input style={{ ...inputStyle, marginTop: 6 }} value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="cliente@empresa.com" />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ fontSize: 12, color: "#475569", fontWeight: 700 }}>
                Contacto
                <input style={{ ...inputStyle, marginTop: 6 }} value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="Nombre" />
              </label>
              <label style={{ fontSize: 12, color: "#475569", fontWeight: 700 }}>
                WhatsApp
                <input style={{ ...inputStyle, marginTop: 6 }} value={celular} onChange={(e) => setCelular(e.target.value)} placeholder="51999999999" />
              </label>
            </div>
            <label style={{ fontSize: 12, color: "#475569", fontWeight: 700 }}>
              Avatar del cliente
              <div style={{ marginTop: 8 }}>
                <ClientAvatarPicker
                  name={cliente?.empresa || contacto || email || "Cliente"}
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
            </label>
          </div>

          {error && (
            <div style={{ marginTop: 14, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#DC2626", padding: "10px 12px", borderRadius: 10, fontSize: 12 }}>
              {error}
            </div>
          )}

          {!resultado && (
            <button onClick={crear} disabled={creando || subiendoAvatar} style={{
              width: "100%", marginTop: 16, padding: "14px", border: "none", borderRadius: 12,
              background: creando || subiendoAvatar ? "#93C5FD" : "#2563EB", color: "#fff", fontWeight: 800, fontSize: 14,
              cursor: creando || subiendoAvatar ? "not-allowed" : "pointer",
            }}>
              {creando ? "Creando usuario..." : subiendoAvatar ? "Preparando avatar..." : "Crear usuario y contraseña"}
            </button>
          )}
        </div>

        {resultado && (
          <div style={{ background: "#0D1629", border: "1px solid rgba(147,197,253,0.18)", borderRadius: 16, padding: 16, marginTop: 14, color: "#fff" }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>Acceso listo</div>
            <div style={{ fontSize: 12.5, color: "rgba(226,232,240,0.72)", marginBottom: 12 }}>
              Copia o envía este acceso al usuario del cliente.
            </div>
            <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 12, padding: 12, fontSize: 12.5, lineHeight: 1.55, whiteSpace: "pre-wrap", color: "rgba(255,255,255,0.88)" }}>
              {mensaje}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
              <a href={whatsappHref} target="_blank" rel="noreferrer" style={{ textAlign: "center", textDecoration: "none", background: "#22C55E", color: "#fff", borderRadius: 12, padding: "12px", fontWeight: 800, fontSize: 13 }}>
                Enviar WhatsApp
              </a>
              <a href={mailHref} style={{ textAlign: "center", textDecoration: "none", background: "#3B82F6", color: "#fff", borderRadius: 12, padding: "12px", fontWeight: 800, fontSize: 13 }}>
                Enviar correo
              </a>
            </div>
            <button onClick={onBack} style={{ width: "100%", marginTop: 10, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", borderRadius: 12, padding: "12px", fontWeight: 800, cursor: "pointer" }}>
              Volver al cliente
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
