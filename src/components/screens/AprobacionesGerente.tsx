import { useCallback, useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import BackChevron from "../BackChevron";
import { cloudFunctions } from "../../config/firebase";
import { fechaCorta } from "../../utils/fechas";
import { mensajeDeError } from "../../utils/errores";
import type { SolicitudAccion } from "../../types";

interface Props {
  onBack: () => void;
}

const ETIQUETAS_TIPO: Record<SolicitudAccion["tipo"], string> = {
  eliminarContrato: "Eliminar campaña",
  eliminarClienteDefinitivo: "Eliminar cliente",
  eliminarUsuario: "Eliminar usuario",
  crearPanel: "Crear panel",
  actualizarPanel: "Editar panel",
};

type Estado =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; solicitudes: SolicitudAccion[] };

export default function AprobacionesGerente({ onBack }: Props) {
  const [estado, setEstado] = useState<Estado>({ status: "loading" });
  const [resolviendoId, setResolviendoId] = useState<string | null>(null);
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [accionError, setAccionError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!cloudFunctions) {
      setEstado({ status: "error", message: "Firebase Functions no está configurado." });
      return;
    }
    setEstado((actual) => (actual.status === "ready" ? actual : { status: "loading" }));
    try {
      const fn = httpsCallable<Record<string, never>, { solicitudes: SolicitudAccion[] }>(cloudFunctions, "listarSolicitudesAccion");
      const res = await fn({});
      setEstado({ status: "ready", solicitudes: res.data.solicitudes });
    } catch (err) {
      setEstado({
        status: "error",
        message: mensajeDeError(err, "No se pudieron cargar las solicitudes. Revisa tu conexión e intenta de nuevo."),
      });
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function resolver(id: string, accion: "aprobar" | "rechazar", motivo?: string) {
    if (!cloudFunctions) {
      setAccionError("Firebase Functions no está configurado.");
      return;
    }
    setAccionError(null);
    setResolviendoId(id);
    try {
      const fn = httpsCallable<
        { solicitudId: string; accion: "aprobar" | "rechazar"; motivoRechazo?: string },
        { ok: boolean }
      >(cloudFunctions, "resolverSolicitudAccion");
      await fn({ solicitudId: id, accion, motivoRechazo: motivo });
      setRechazandoId(null);
      setMotivoRechazo("");
      await cargar();
    } catch (err) {
      setAccionError(
        mensajeDeError(err, "No se pudo resolver la solicitud. Si acaba de actualizarse la app, puede que falte desplegar la función en GitHub Actions.")
      );
    } finally {
      setResolviendoId(null);
    }
  }

  const solicitudes = estado.status === "ready" ? estado.solicitudes : [];
  const pendientes = solicitudes.filter((s) => s.estado === "Pendiente");
  const resueltas = solicitudes.filter((s) => s.estado !== "Pendiente");

  return (
    <div className="admin-tool-screen solicitudes-screen">
      <div className="detail-header">
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Aprobaciones</div>
        <div style={{ width: 32 }} />
      </div>

      <div className="content-area solicitudes-area">
        <div className="card" style={{ background: "rgba(8,119,255,0.12)" }}>
          <div style={{ fontSize: 12, color: "#6D28D9", lineHeight: 1.5 }}>
            Acciones que un Trabajador pidió hacer y necesitan tu aprobación. Solo tú ves esta pantalla.
          </div>
        </div>

        {accionError && (
          <div
            style={{
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
              color: "#DC2626", fontSize: 12, lineHeight: 1.5, padding: "10px 14px",
              borderRadius: 12, margin: "10px 0", display: "flex", alignItems: "flex-start", gap: 10,
            }}
          >
            <span style={{ flex: 1 }}>{accionError}</span>
            <button
              type="button"
              onClick={() => setAccionError(null)}
              aria-label="Cerrar aviso"
              style={{ background: "none", border: "none", color: "#DC2626", fontSize: 16, lineHeight: 1, cursor: "pointer", padding: 0, flexShrink: 0 }}
            >
              ×
            </button>
          </div>
        )}

        {estado.status === "loading" && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center" }}>Cargando…</div>
        )}
        {estado.status === "error" && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center", color: "var(--red)" }}>
            {estado.message}
          </div>
        )}

        {estado.status === "ready" && pendientes.length === 0 && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center" }}>
            No hay solicitudes pendientes.
          </div>
        )}

        {pendientes.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {pendientes.map((s) => (
              <div className="card solicitudes-card" key={s.id}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 4 }}>
                  {ETIQUETAS_TIPO[s.tipo]}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 3 }}>
                  {s.resumen}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
                  Pedido por {s.solicitanteNombre} · {fechaCorta(s.createdAt)}
                </div>

                {rechazandoId === s.id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <input
                      type="text"
                      value={motivoRechazo}
                      onChange={(e) => setMotivoRechazo(e.target.value)}
                      placeholder="Motivo del rechazo (opcional)"
                      style={{
                        width: "100%", border: "1px solid rgba(15,23,42,0.14)", borderRadius: 10,
                        padding: "10px 12px", fontSize: 12, color: "var(--text)",
                      }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button"
                        onClick={() => void resolver(s.id, "rechazar", motivoRechazo.trim() || undefined)}
                        disabled={resolviendoId === s.id}
                        style={{
                          flex: 1, background: "var(--red)", border: "none", borderRadius: 12,
                          padding: "10px 12px", color: "#fff", fontSize: 12, fontWeight: 700,
                          cursor: resolviendoId === s.id ? "not-allowed" : "pointer",
                        }}
                      >
                        {resolviendoId === s.id ? "Guardando…" : "Confirmar rechazo"}
                      </button>
                      <button type="button"
                        onClick={() => { setRechazandoId(null); setMotivoRechazo(""); }}
                        disabled={resolviendoId === s.id}
                        style={{
                          background: "rgba(15,23,42,0.06)", border: "none", borderRadius: 12,
                          padding: "10px 14px", color: "var(--text)", fontSize: 12, fontWeight: 700, cursor: "pointer",
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button"
                      onClick={() => void resolver(s.id, "aprobar")}
                      disabled={resolviendoId === s.id}
                      style={{
                        flex: 1, background: "var(--accent)", border: "none", borderRadius: 12,
                        padding: "10px 12px", color: "#fff", fontSize: 12, fontWeight: 700,
                        cursor: resolviendoId === s.id ? "not-allowed" : "pointer",
                      }}
                    >
                      {resolviendoId === s.id ? "Guardando…" : "✓ Aprobar"}
                    </button>
                    <button type="button"
                      onClick={() => setRechazandoId(s.id)}
                      disabled={resolviendoId === s.id}
                      style={{
                        background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                        borderRadius: 12, padding: "10px 14px", color: "var(--red)", fontSize: 12,
                        fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      ✕ Rechazar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {resueltas.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 20 }}>Historial</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {resueltas.map((s) => (
                <div
                  key={s.id}
                  className="card"
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "12px 14px" }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, color: "var(--text)" }}>{s.resumen}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                      {s.solicitanteNombre} · {fechaCorta(s.resueltoEn)}
                      {s.motivoRechazo ? ` · ${s.motivoRechazo}` : ""}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 20, flexShrink: 0,
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
