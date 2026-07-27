import { useState, useId, isValidElement, cloneElement } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, cloudFunctions } from "../../config/firebase";
import { usePanelesDisponibles } from "../../hooks/usePanelesDisponibles";
import { formatCampaignName } from "../../utils/campaignName";
import { sumarMeses } from "../../utils/fechas";
import BackChevron from "../BackChevron";

interface Props {
  clienteId: string;
  onBack: () => void;
  onEnviada: () => void;
  isAdmin?: boolean;
  /** Precarga el formulario del CLIENTE -- lo usa Cobertura cuando la
   *  persona pide disponibilidad o renovación de un panel puntual
   *  desde el mapa, para no hacerla escribir todo de cero. */
  prefill?: {
    nombre?: string;
    ciudad?: string;
    comentarios?: string;
    /** Cuando la solicitud sale del mapa, el panel ya está elegido -- se
     *  muestra como dato fijo en vez de volver a preguntar la ciudad. */
    panelId?: string;
    panelNombre?: string;
  };
}

const CIUDADES = ["Huánuco", "Lima", "Arequipa", "Trujillo", "Chiclayo", "Piura", "Cusco", "Iquitos", "Huancayo", "Tacna", "Pucallpa", "Otra"];

/**
 * Etiqueta + campo. La etiqueta se asocia al campo con htmlFor/id, así
 * TOCARLA enfoca el campo -- en el celular eso agranda bastante el área
 * útil de cada fila, y además es lo que necesita un lector de pantalla
 * para anunciar de qué campo se trata.
 *
 * El id se genera con useId() y se inyecta en el hijo con cloneElement,
 * para no tener que inventar y mantener un id a mano en cada uso. Si el
 * hijo ya trae su propio id, se respeta.
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  const hijo = isValidElement(children)
    ? cloneElement(children as React.ReactElement<{ id?: string }>, {
        id: (children.props as { id?: string }).id ?? id,
      })
    : children;
  return (
    <div style={{ marginBottom: 16 }}>
      <label
        htmlFor={id}
        style={{ fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6, letterSpacing: 0.3 }}
      >
        {label}
      </label>
      {hijo}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", background: "#fff", border: "1.5px solid #E5E7EB",
  borderRadius: 12, padding: "12px 14px", fontSize: 14, color: "#0B1220",
  outline: "none", boxSizing: "border-box",
  // minWidth/maxWidth explícitos -- un <input type="date"> a veces pide
  // más ancho del que le corresponde (el reloj/calendario nativo de
  // Safari/iOS no siempre respeta width:100% solo), y sin esto se salía
  // del borde redondeado de la tarjeta blanca en vez de quedarse adentro.
  minWidth: 0, maxWidth: "100%",
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
  const [ciudad, setCiudad] = useState(() => prefill?.ciudad ?? "Huánuco");
  // Si venimos del mapa con un panel concreto, preguntar la ciudad otra
  // vez sobra -- y peor, si eligiera una distinta contradiría al panel.
  const panelFijo = prefill?.panelNombre ? { id: prefill.panelId ?? "", nombre: prefill.panelNombre } : null;
  const [comentarios, setComentarios] = useState(() => prefill?.comentarios ?? "");
  // Fecha desde la que le gustaría empezar -- no se puede pedir una
  // campaña con fecha de antes de hoy, por eso el min del input ya
  // bloquea (en gris) cualquier día pasado directo en el calendario
  // nativo, sin necesidad de armar un calendario propio.
  // "Hoy" en base a la hora de Peru (America/Lima), no la hora UTC ni
  // la del dispositivo -- con toISOString().slice(0,10) crudo, cualquier
  // cliente que abra el formulario entre las 7pm y la medianoche en Lima
  // ya cae en el dia UTC siguiente, y el min del calendario terminaba
  // bloqueando el dia de HOY (o dejando pasar fechas que ya deberian estar
  // vencidas). Mismo criterio que ya usa notificacionesPush.ts del lado
  // del servidor (hoyEnLima()).
  const hoyStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const [fechaInicio, setFechaInicio] = useState(hoyStr);
  // Duración en meses en vez de un calendario de "fecha de fin": es lo
  // que el cliente sí sabe de entrada ("quiero 3 meses"), es un solo
  // toque en el celular en vez de pelear con el date picker, y encaja
  // con el mínimo de 3 meses que ya se le anuncia debajo. La fecha de
  // fin se calcula sola a partir del inicio.
  const [meses, setMeses] = useState(3);
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
        ciudades: ciudad ? [ciudad] : [],
        comentarios: comentarios.trim(),
        fechaInicioDeseada: fechaInicio,
        fechaFinDeseada: sumarMeses(fechaInicio, meses),
        mesesDeseados: meses,
        ...(panelFijo ? { panelSolicitadoId: panelFijo.id, panelSolicitadoNombre: panelFijo.nombre } : {}),
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
    if (inicio < hoyStr) { setErrorAdmin("La fecha de inicio no puede ser anterior a hoy."); return; }
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
          {/* overflow:"hidden" -- red de seguridad: si el control nativo
              de fecha (input type=date) llegara a pedir más ancho del
              que le corresponde en algún navegador, que se recorte
              contra el borde redondeado en vez de salirse visualmente
              de la tarjeta blanca. */}
          <div style={{ background: "#fff", borderRadius: 16, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,0.07)", overflow: "hidden" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0B1220", marginBottom: 18 }}>
              Crear campaña para este cliente
            </div>

            {errorAdmin && (
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#DC2626", fontSize: 13, padding: "10px 14px", borderRadius: 12, marginBottom: 16 }}>
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
              <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8, lineHeight: 1.4 }}>
                Elige uno o varios paneles -- si eliges más de uno, esta campaña queda como una
                sola con todos esos paneles (útil cuando el cliente cotiza 2+ ubicaciones juntas).
              </div>
              <div style={{ border: "1.5px solid #E5E7EB", borderRadius: 12, maxHeight: 220, overflowY: "auto", background: "#fff" }}>
                {panelesState.status === "loading" && (
                  <div style={{ padding: "12px 14px", fontSize: 13, color: "#64748B" }}>Cargando paneles…</div>
                )}
                {panelesState.status === "ready" && paneles.length === 0 && (
                  <div style={{ padding: "12px 14px", fontSize: 13, color: "#64748B" }}>No hay paneles registrados.</div>
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
                      <span style={{ fontSize: 13, color: "#0B1220", flex: 1 }}>
                        {p.nombre} — {p.ciudad} {p.estado === "Ocupado" ? "(Ocupado)" : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
            </Field>
            <div style={{ display: "flex", gap: 10 }}>
              {/* minWidth: 0 en cada columna -- sin esto, un <input type="date">
                  adentro de un hijo flex puede pedir mas ancho del que le toca
                  (el minimo por defecto de un item flex es el de su contenido,
                  no 0) y se sale del borde de la tarjeta blanca en vez de
                  encogerse a la mitad disponible. */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Field label="Fecha de inicio">
                  <input style={inputStyle} type="date" min={hoyStr} value={inicio} onChange={(e) => setInicio(e.target.value)} />
                </Field>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Field label="Fecha de fin">
                  <input style={inputStyle} type="date" min={inicio || hoyStr} value={fin} onChange={(e) => setFin(e.target.value)} />
                </Field>
              </div>
            </div>
          </div>
          <div style={{ height: 16 }} />
        </div>

        <div style={{ padding: "12px 16px calc(20px + env(safe-area-inset-bottom))", background: "#fff", borderTop: "1px solid #F3F4F6", flexShrink: 0 }}>
          <button onClick={crearContrato} disabled={creando} style={{
            width: "100%", padding: "14px", background: creando ? "#93C5FD" : "#0877FF", color: "#fff",
            fontWeight: 700, fontSize: 14, border: "none", borderRadius: 16, cursor: creando ? "default" : "pointer",
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
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0B1220", marginBottom: 8 }}>Solicitud enviada</div>
            <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5 }}>
              Alguien del equipo se comunicará contigo para confirmar disponibilidad y coordinar los detalles.
            </div>
          </div>
        </div>
        <div style={{ padding: "12px 16px calc(20px + env(safe-area-inset-bottom))", background: "#fff", borderTop: "1px solid #F3F4F6", flexShrink: 0 }}>
          <button onClick={onEnviada} style={{
            width: "100%", padding: "14px", background: "#0877FF", color: "#fff",
            fontWeight: 700, fontSize: 14, border: "none", borderRadius: 16, cursor: "pointer",
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
        <div style={{ background: "#fff", borderRadius: 16, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,0.07)", overflow: "hidden" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0B1220", marginBottom: 18 }}>Información de la campaña</div>

          {error && (
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#DC2626", fontSize: 13, padding: "10px 14px", borderRadius: 12, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <Field label="Nombre de la campaña">
            <input style={inputStyle} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Campaña Invierno 2024" />
          </Field>
          {panelFijo ? (
            <Field label="Panel solicitado">
              <div style={{
                ...inputStyle,
                background: "#F8FAFC",
                display: "flex",
                alignItems: "center",
                gap: 9,
                color: "#0B1220",
                fontWeight: 600,
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0877FF" strokeWidth="1.9" style={{ flexShrink: 0 }}>
                  <path d="M12 21s6-5.15 6-11a6 6 0 1 0-12 0c0 5.85 6 11 6 11Z" />
                  <circle cx="12" cy="10" r="1.8" />
                </svg>
                <span style={{ minWidth: 0, overflowWrap: "break-word" }}>
                  {panelFijo.nombre}{ciudad ? ` · ${ciudad}` : ""}
                </span>
              </div>
            </Field>
          ) : (
            <Field label="Ciudad">
              <select style={selectStyle} value={ciudad} onChange={(e) => setCiudad(e.target.value)}>
                {CIUDADES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          )}
          <Field label="Fecha de inicio deseada">
            <input
              style={inputStyle}
              type="date"
              min={hoyStr}
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
          </Field>
          <Field label="¿Por cuánto tiempo?">
            <div style={{ display: "flex", gap: 8 }}>
              {[3, 6, 12].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMeses(n)}
                  style={{
                    flex: 1,
                    padding: "12px 6px",
                    borderRadius: 12,
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 800,
                    border: meses === n ? "1.5px solid #0877FF" : "1.5px solid #E5E7EB",
                    background: meses === n ? "rgba(8,119,255,0.08)" : "#fff",
                    color: meses === n ? "#0877FF" : "#0B1220",
                  }}
                >
                  {n} meses
                </button>
              ))}
            </div>
          </Field>
          <div style={{ fontSize: 11, color: "#0B1220", marginTop: -10, marginBottom: 16, lineHeight: 1.45 }}>
            El contrato mínimo es de 3 meses.
            {fechaInicio && (
              <> Terminaría el <strong>{sumarMeses(fechaInicio, meses)}</strong>.</>
            )}
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
          fontWeight: 700, fontSize: 14, border: "none", borderRadius: 16, cursor: enviando ? "default" : "pointer",
        }}>
          {enviando ? "Enviando…" : "Enviar solicitud"}
        </button>
      </div>
    </div>
  );
}
