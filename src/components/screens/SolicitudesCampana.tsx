import { doc, updateDoc } from "firebase/firestore";
import { useState } from "react";
import BackChevron from "../BackChevron";
import { db } from "../../config/firebase";
import { useSolicitudesCampana } from "../../hooks/useSolicitudesCampana";
import { useClientesAdmin } from "../../hooks/useClientesAdmin";
import { BrandThumb } from "../BrandThumb";

interface Props {
  onBack: () => void;
}

export default function SolicitudesCampana({ onBack }: Props) {
  const state = useSolicitudesCampana(true);
  const clientesState = useClientesAdmin();
  const [resolviendo, setResolviendo] = useState<string | null>(null);

  const clientes = clientesState.status === "ready" ? clientesState.clientes : [];
  const nombreCliente = (clienteId: string) =>
    clientes.find((c) => c.id === clienteId)?.empresa ?? "Cliente";

  const solicitudes = state.status === "ready" ? state.solicitudes : [];
  const pendientes = solicitudes.filter((s) => s.estado === "Pendiente");
  const resueltas = solicitudes.filter((s) => s.estado !== "Pendiente");

  async function resolver(id: string, estado: "Revisada" | "Rechazada") {
    if (!db) return;
    setResolviendo(id);
    try {
      await updateDoc(doc(db, "solicitudesCampana", id), { estado });
    } catch {
      // el estado vuelve a Pendiente solo si falla, no hace falta más feedback aquí
    }
    setResolviendo(null);
  }

  return (
    <div>
      <div className="detail-header">
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Solicitudes de campaña</div>
        <div style={{ width: 32 }} />
      </div>

      <div className="content-area">
        <div className="card" style={{ background: "rgba(139,92,246,0.12)" }}>
          <div style={{ fontSize: 12.5, color: "#6D28D9", lineHeight: 1.5 }}>
            Lo que tus clientes piden desde su portal. Solo tú ves esta pantalla.
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

        {state.status === "ready" && pendientes.length === 0 && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center" }}>
            No hay solicitudes pendientes.
          </div>
        )}

        {pendientes.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {pendientes.map((s) => (
              <div className="card" key={s.id}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                  <BrandThumb name={nombreCliente(s.cliente_id)} size={40} radius={10} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                      {nombreCliente(s.cliente_id)} — {s.nombre}
                    </div>
                    {s.objetivo && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>🎯 {s.objetivo}</div>
                    )}
                    {s.presupuesto != null && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                        💰 S/ {s.presupuesto.toLocaleString("es-PE")}
                      </div>
                    )}
                    {s.ciudades?.length > 0 && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                        📍 {s.ciudades.join(", ")}
                      </div>
                    )}
                    {s.comentarios && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, fontStyle: "italic" }}>
                        {s.comentarios}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => resolver(s.id, "Revisada")}
                    disabled={resolviendo === s.id}
                    style={{
                      flex: 1, background: "var(--accent)", border: "none", borderRadius: 10,
                      padding: "10px 12px", color: "#fff", fontSize: 12.5, fontWeight: 700,
                      cursor: resolviendo === s.id ? "not-allowed" : "pointer",
                    }}
                  >
                    {resolviendo === s.id ? "Guardando…" : "✓ Marcar revisada"}
                  </button>
                  <button
                    onClick={() => resolver(s.id, "Rechazada")}
                    disabled={resolviendo === s.id}
                    style={{
                      background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                      borderRadius: 10, padding: "10px 14px", color: "var(--red)", fontSize: 12.5,
                      fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {resueltas.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 20 }}>Ya gestionadas</div>
            <div className="card">
              {resueltas.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 0", borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div style={{ fontSize: 13, color: "var(--text)" }}>
                    {nombreCliente(s.cliente_id)} — {s.nombre}
                  </div>
                  <div
                    style={{
                      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                      color: s.estado === "Rechazada" ? "var(--red)" : "var(--green)",
                      background: s.estado === "Rechazada" ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.12)",
                    }}
                  >
                    {s.estado}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
