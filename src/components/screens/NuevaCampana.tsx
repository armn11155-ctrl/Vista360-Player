import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, cloudFunctions } from "../../config/firebase";
import { usePanelesDisponibles } from "../../hooks/usePanelesDisponibles";
import { formatCampaignName } from "../../utils/campaignName";
import BackChevron from "../BackChevron";

interface Props {
  clienteId: string;
  onBack: () => void;
  onEnviada: () => void;
  isAdmin?: boolean;
  /** Precarga el formulario del CLIENTE -- lo usa Cobertura cuando la
   *  persona pide disponibilidad o renovación de un panel puntual
   *  desde el mapa, para no hacerla escribir todo de cero. */
  prefill?: { nombre?: string; ciudad?: string; comentarios?: string };
}

const CIUDADES = ["Lima", "Arequipa", "Trujillo", "Chiclayo", "Piura", "Cusco", "Iquitos", "Huancayo", "Tacna", "Pucallpa", "Huánuco", "Otra"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 6, letterSpacing: 0.3 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", background: "#fff", border: "1.5px solid #E5E7EB",
  borderRadius: 10, padding: "12px 14px", fontSize: 14, color: "#0B1220",
  outline: "none", boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, appearance: "none",
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center",
};

export default function NuevaCampana({ clienteId, onBack, onEnviada, isAdmin, prefill }: Props) {
  // ── Formulario del CLIENTE: pedir una campaña nueva (queda como
  //    solicitud pendiente, la revisa el admin) ──────────────────────
  const [nombre, setNombre] = useState(() => prefill?.nombre ?? "");
  const [objetivo, setObjetivo] = useState("");
  const [ciudad, setCiudad] = useState(() => prefill?.ciudad ?? "");
  const [comentarios, setComentarios] = useState(() => prefill?.comentarios ?? "");
  // Fecha desde la que le gustaría empezar -- no se puede pedir una
  // campaña con fecha de antes de hoy, por eso el min del input ya
  // bloquea (en gris) cualquier día pasado directo en el calendario
  // nativo, sin necesidad de armar un calendario propio.
  const hoyStr = new Date().toISOString().slice(0, 10);
  const [fechaInicio, setFechaInicio] = useState(hoyStr);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  // Se muestra después de enviar en vez de saltar directo a "Mis
  // campañas" en silencio -- se pidió un mensaje claro de que el
  // equipo se va a comunicar para confirmar viabilidad/fechas (por
  // ahora es manual; automatizar la disponibilidad real queda para
  // más adelante).
  const [enviado, setEnviado] = useState(false);

  async function enviar() {
    setError("");
    if (!nombre.trim()) { setError("Ponle un nombre a tu campaña."); return; }
    if (!clienteId) { setError("Error: no se identificó tu cuenta. Cierra sesión y vuelve a entrar."); return; }
    if (!db) { setError("Sin conexión. Intenta de nuevo."); return; }
    if (fechaInicio < hoyStr) { setError("La fecha de inicio no puede ser anterior a hoy."); return; }
    setEnviando(true);
    try {
      await addDoc(collection(db, "solicitudesCampana"), {
        cliente_id: clienteId,
        nombre: formatCampaignName(nombre),
        objetivo: objetivo.trim(),
        ciudades: ciudad ? [ciudad] : [],
        comentarios: comentarios.trim(),
        fechaInicioDeseada: fechaInicio,
        estado: "Pendiente",
        createdAt: serverTimestamp(),
      });
      setEnviado(true);
    } catch {
      setError("No se pudo enviar la solicitud. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  // ── Formulario del ADMIN: crear el contrato real directo ───────────
  const panelesState = usePanelesDisponibles(!!isAdmin);
  // Una campaña puede tener 2+ paneles (ej. el cliente cotiza dos
  // ubicaciones en un solo contrato) -- por eso es multi-selección, no
  // un <select> de uno solo como antes.
  const [panelIds, setPanelIds] = useState<string[]>([]);
  const [nombreCampanaAdmin, setNombreCampanaAdmin] = useState("");
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [errorAdmin, setErrorAdmin] = useState("");
  const [creando, setCreando] = useState(false);

  function togglePanel(id: string) {
    setPanelIds((actuales) => (actuales.includes(id) ? actuales.filter((p) => p !== id) : [...actuales, id]));
  }

  async function crearContrato() {
    setErrorAdmin("");
    if (panelIds.length === 0) { setErrorAdmin("Elige al menos un panel."); return; }
    if (!inicio || !fin) { setErrorAdmin("Pon fecha de inicio y de fin."); return; }
    if (fin < inicio) { setErrorAdmin("La fecha de fin no puede ser antes que la de inicio."); return; }
    if (!cloudFunctions) { setErrorAdmin("Sin conexión. Intenta de nuevo."); return; }
    setCreando(true);
    try {
      // Crear el contrato pasa por una Cloud Function (Admin SDK) en
      // vez de un addDoc directo desde el cliente -- así no depende de
      // que las reglas de Firestore reconozcan cada campo nuevo (esto
      // es justo lo que rompía la creación de campañas con 2+ paneles).
      // La validación de traslape de fechas por cada panel también
      // corre del lado del servidor ahora.
      const fn = httpsCallable<
        { clienteId: string; panelIds: string[]; nombre?: string; inicio: string; fin: string; monto: number },
        { ok: boolean; contratoId: string }
      >(cloudFunctions, "crearContrato");
      await fn({
        clienteId,
        panelIds,
        nombre: formatCampaignName(nombreCampanaAdmin) || undefined,
        inicio,
        fin,
        monto: 0,
      });
      onEnviada();
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error || "");
      setErrorAdmin(raw.replace("FirebaseError: ", "").replace(/^functions\/[a-z-]+:\s*/i, "") || "No se pudo crear el contrato. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setCreando(false);
    }
  }

  if (isAdmin) {
    const paneles = panelesState.status === "ready" ? panelesState.paneles : [];
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8F9FB" }}>
        <div className="detail-header">
          <div className="back-btn" onClick={onBack}>
            <BackChevron />
          </div>
          <div className="simple-title">Nuevo contrato</div>
          <div style={{ width: 32 }} />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 16px" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0B1220", marginBottom: 18 }}>
              Crear campaña para este cliente
            </div>

            {errorAdmin && (
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#DC2626", fontSize: 13, padding: "10px 14px", borderRadius: 10, marginBottom: 16 }}>
                {errorAdmin}
              </div>
            )}

            <Field label="Nombre de la campaña (opcional)">
              <input
                style={inputStyle}
                value={nombreCampanaAdmin}
                onChange={(e) => setNombreCampanaAdmin(e.target.value)}
                placeholder="Ej. Campaña Verano 2026"
              />
            </Field>
            <Field label={`Paneles${panelIds.length > 0 ? ` (${panelIds.length} elegido${panelIds.length > 1 ? "s" : ""})` : ""}`}>
              <div style={{ fontSize: 11.5, color: "#6B7280", marginBottom: 8, lineHeight: 1.4 }}>
                Elige uno o varios paneles -- si eliges más de uno, esta campaña queda como una
                sola con todos esos paneles (útil cuando el cliente cotiza 2+ ubicaciones juntas).
              </div>
              <div style={{ border: "1.5px solid #E5E7EB", borderRadius: 10, maxHeight: 220, overflowY: "auto", background: "#fff" }}>
                {panelesState.status === "loading" && (
                  <div style={{ padding: "12px 14px", fontSize: 13, color: "#6B7280" }}>Cargando paneles…</div>
                )}
                {panelesState.status === "ready" && paneles.length === 0 && (
                  <div style={{ padding: "12px 14px", fontSize: 13, color: "#6B7280" }}>No hay paneles registrados.</div>
                )}
                {paneles.map((p, i) => {
                  const elegido = panelIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", cursor: "pointer",
                        borderTop: i === 0 ? "none" : "1px solid #F3F4F6",
                        background: elegido ? "#EEF4FF" : "transparent",
                      }}
                    >
                      <input type="checkbox" checked={elegido} onChange={() => togglePanel(p.id)} style={{ width: 16, height: 16, accentColor: "#0877FF", flexShrink: 0 }} />
                      <span style={{ fontSize: 13.5, color: "#0B1220", flex: 1 }}>
                        {p.nombre} — {p.ciudad} {p.estado === "Ocupado" ? "(Ocupado)" : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
            </Field>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <Field label="Fecha de inicio">
                  <input style={inputStyle} type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Fecha de fin">
                  <input style={inputStyle} type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
                </Field>
              </div>
            </div>
          </div>
          <div style={{ height: 16 }} />
        </div>

        <div style={{ padding: "12px 16px calc(20px + env(safe-area-inset-bottom))", background: "#fff", borderTop: "1px solid #F3F4F6", flexShrink: 0 }}>
          <button onClick={crearContrato} disabled={creando} style={{
            width: "100%", padding: "14px", background: creando ? "#93C5FD" : "#0877FF", color: "#fff",
            fontWeight: 700, fontSize: 15, border: "none", borderRadius: 14, cursor: creando ? "default" : "pointer",
          }}>
            {creando ? "Creando…" : "Crear contrato"}
          </button>
        </div>
      </div>
    );
  }

  if (enviado) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8F9FB" }}>
        <div className="detail-header">
          <div className="back-btn" onClick={onEnviada}>
            <BackChevron />
          </div>
          <div className="simple-title">Nueva campaña</div>
          <div style={{ width: 32 }} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "28px 22px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)", textAlign: "center", maxWidth: 340 }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%", background: "rgba(34,197,94,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: "#0B1220", marginBottom: 8 }}>Solicitud enviada</div>
            <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5 }}>
              Alguien del equipo se comunicará contigo para confirmar disponibilidad y coordinar los detalles.
            </div>
          </div>
        </div>
        <div style={{ padding: "12px 16px calc(20px + env(safe-area-inset-bottom))", background: "#fff", borderTop: "1px solid #F3F4F6", flexShrink: 0 }}>
          <button onClick={onEnviada} style={{
            width: "100%", padding: "14px", background: "#0877FF", color: "#fff",
            fontWeight: 700, fontSize: 15, border: "none", borderRadius: 14, cursor: "pointer",
          }}>
            Listo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8F9FB" }}>
      {/* Header */}
      <div className="detail-header">
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Nueva campaña</div>
        <div style={{ width: 32 }} />
      </div>

      {/* Form */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 16px" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0B1220", marginBottom: 18 }}>Información de la campaña</div>

          {error && (
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#DC2626", fontSize: 13, padding: "10px 14px", borderRadius: 10, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <Field label="Nombre de la campaña">
            <input style={inputStyle} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Campaña Invierno 2024" />
          </Field>
          <Field label="Objetivo de la campaña">
            <input style={inputStyle} value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="Ej. Dar a conocer nuevo producto" />
          </Field>
          <Field label="Ciudad">
            <select style={selectStyle} value={ciudad} onChange={(e) => setCiudad(e.target.value)}>
              <option value="">Selecciona una ciudad</option>
              {CIUDADES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Fecha de inicio deseada">
            <input
              style={inputStyle}
              type="date"
              min={hoyStr}
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
          </Field>
          <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: -10, marginBottom: 16, lineHeight: 1.4 }}>
            El contrato mínimo es de 3 meses (también hay opciones de 5, 6 y 12 meses).
          </div>
          <Field label="Comentarios adicionales">
            <textarea style={{ ...inputStyle, minHeight: 80, resize: "none" }} value={comentarios} onChange={(e) => setComentarios(e.target.value)} placeholder="Cuéntanos más sobre tu campaña..." />
          </Field>
        </div>
        <div style={{ height: 16 }} />
      </div>

      {/* Footer */}
      <div style={{ padding: "12px 16px calc(20px + env(safe-area-inset-bottom))", background: "#fff", borderTop: "1px solid #F3F4F6", flexShrink: 0 }}>
        <button onClick={enviar} disabled={enviando} style={{
          width: "100%", padding: "14px", background: enviando ? "#93C5FD" : "#0877FF", color: "#fff",
          fontWeight: 700, fontSize: 15, border: "none", borderRadius: 14, cursor: enviando ? "default" : "pointer",
        }}>
          {enviando ? "Enviando…" : "Enviar solicitud"}
        </button>
      </div>
    </div>
  );
}
