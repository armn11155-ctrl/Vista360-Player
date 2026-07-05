import { useState } from "react";
import BackChevron from "../BackChevron";
import { useInvitaciones } from "../../hooks/useInvitaciones";
import { BrandThumb } from "../BrandThumb";

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
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

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

  return (
    <div>
      <div className="detail-header">
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Accesos</div>
        <div style={{ width: 32 }} />
      </div>

      <div className="content-area">
        <div className="card" style={{ background: "rgba(59,130,246,0.12)" }}>
          <div style={{ fontSize: 12.5, color: "#1D4ED8", lineHeight: 1.5 }}>
            Cada vez que se crea un acceso nuevo, se manda un correo automático — pero aquí
            puedes copiar el mismo link y mandarlo tú a mano (WhatsApp, etc.) por si el correo
            no llega a tiempo o cae en spam.
          </div>
        </div>

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
            Aún no se ha creado ningún acceso.
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
                  <BrandThumb name={inv.clienteNombre || inv.email} size={38} radius={10} />
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
