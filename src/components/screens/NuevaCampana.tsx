import { useState, useId, isValidElement, cloneElement } from "react";
import { campoBase } from "../../styles/campos";
import { mensajeDeError } from "../../utils/errores";
import { httpsCallable } from "firebase/functions";
import { cloudFunctions } from "../../config/firebase";
import { usePanelesDisponibles } from "../../hooks/usePanelesDisponibles";
import { formatCampaignName } from "../../utils/campaignName";
import { fechaLarga, sumarMeses } from "../../utils/fechas";
import BackButton from "../BackButton";

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
    motivo?: "disponibilidad" | "renovacion";
  };
}

const MAX_NOMBRE = 80;
const MAX_COMENTARIOS = 1000;

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
  const esControl = isValidElement(children) && ["input", "select", "textarea"].includes(String(children.type));
  const controlId = esControl ? (children.props as { id?: string }).id ?? id : id;
  const hijo = esControl
    ? cloneElement(children as React.ReactElement<{ id?: string }>, {
        id: controlId,
      })
    : children;
  return (
    <div className="campaign-field">
      {esControl
        ? <label className="campaign-field-label" htmlFor={controlId}>{label}</label>
        : <div className="campaign-field-label">{label}</div>}
      {hijo}
    </div>
  );
}

function CampaignFormProgress({ complete = false }: { complete?: boolean }) {
  return (
    <div className={`campaign-form-progress${complete ? " is-complete" : ""}`} aria-label={complete ? "Solicitud enviada" : "Paso 1 de 2: completa tu solicitud"}>
      <div className="is-active"><span>{complete ? "✓" : "1"}</span><small>Solicitud</small></div>
      <i aria-hidden="true" />
      <div className={complete ? "is-active" : ""}><span>{complete ? "✓" : "2"}</span><small>Confirmación</small></div>
    </div>
  );
}

const inputStyle = campoBase;

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
  const esRenovacion = panelFijo && prefill?.motivo === "renovacion";
  const [tipoConsulta, setTipoConsulta] = useState<"espacio" | "alternativas">("espacio");
  const tituloSolicitud = panelFijo
    ? esRenovacion ? "Solicitar renovación" : "Solicitar disponibilidad"
    : "Nueva campaña";
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
  const [enviadoYaExistia, setEnviadoYaExistia] = useState(false);

  async function enviar() {
    setError("");
    const quiereAlternativas = Boolean(panelFijo && !esRenovacion && tipoConsulta === "alternativas");
    const notaAlternativas = quiereAlternativas ? `Prefiero recibir alternativas similares en ${ciudad || "la ciudad indicada"}.` : "";
    const comentariosSolicitud = [notaAlternativas, comentarios.trim()].filter(Boolean).join("\n");
    if (!nombre.trim()) { setError("Ponle un nombre a tu campaña."); return; }
    // Topes de largo -- el maxLength de los inputs es solo comodidad (se
    // salta pegando texto por consola o con el navegador en modo
    // desarrollador). La Cloud Function los vuelve a revisar del lado
    // del servidor, pero conviene frenarlo acá también para no ni
    // siquiera intentar la llamada con algo que se sabe que va a fallar.
    if (nombre.trim().length > MAX_NOMBRE) {
      setError(`El nombre no puede pasar de ${MAX_NOMBRE} caracteres.`); return;
    }
    if (comentariosSolicitud.length > MAX_COMENTARIOS) {
      setError(`Los comentarios no pueden pasar de ${MAX_COMENTARIOS} caracteres.`); return;
    }
    if (!clienteId) { setError("Error: no se identificó tu cuenta. Cierra sesión y vuelve a entrar."); return; }
    if (!cloudFunctions) { setError("Sin conexión. Intenta de nuevo."); return; }
    if (fechaInicio < hoyStr) { setError("La fecha de inicio no puede ser anterior a hoy."); return; }
    setEnviando(true);
    try {
      // Antes esto era un addDoc directo a Firestore -- dejó de
      // funcionar ("No tienes permiso para hacer esto.") en cuanto el
      // formulario empezó a mandar más campos (ciudades, fechaFinDeseada)
      // de los que las reglas de "solicitudesCampana" tenían contempladas.
      // Ahora pasa por Admin SDK, igual que crearContrato/eliminarContrato,
      // así que no depende de mantener esas reglas sincronizadas a mano
      // con el formulario. Ver crearSolicitudCampana.ts para el detalle.
      const fn = httpsCallable<
        {
          clienteId: string; nombre: string; ciudades: string[]; comentarios: string;
          fechaInicioDeseada: string; fechaFinDeseada: string; mesesDeseados: number;
          panelSolicitadoId?: string; panelSolicitadoNombre?: string;
        },
        { ok: boolean; id: string; yaExistia?: boolean }
      >(cloudFunctions, "crearSolicitudCampana");
      const res = await fn({
        clienteId,
        nombre: formatCampaignName(nombre),
        ciudades: ciudad ? [ciudad] : [],
        comentarios: comentariosSolicitud,
        fechaInicioDeseada: fechaInicio,
        fechaFinDeseada: sumarMeses(fechaInicio, meses),
        mesesDeseados: meses,
        ...(panelFijo && !quiereAlternativas ? { panelSolicitadoId: panelFijo.id, panelSolicitadoNombre: panelFijo.nombre } : {}),
      });
      setEnviadoYaExistia(Boolean(res.data.yaExistia));
      setEnviado(true);
    } catch (error) {
      setError(mensajeDeError(error, "No se pudo enviar la solicitud. Revisa tu conexión e intenta de nuevo."));
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
      setErrorAdmin(mensajeDeError(error, "No se pudo crear el contrato. Revisa tu conexión e intenta de nuevo."));
    } finally {
      setCreando(false);
    }
  }

  if (isAdmin) {
    const paneles = panelesState.status === "ready" ? panelesState.paneles : [];
    return (
      <div className="campaign-admin-screen" style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8F9FB" }}>
        <div className="detail-header">
          <BackButton onClick={onBack} />
          <div className="simple-title">Nueva campaña</div>
          <div style={{ width: 32 }} />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 16px" }}>
          {/* overflow:"hidden" -- red de seguridad: si el control nativo
              de fecha (input type=date) llegara a pedir más ancho del
              que le corresponde en algún navegador, que se recorte
              contra el borde redondeado en vez de salirse visualmente
              de la tarjeta blanca. */}
          <div className="new-campaign-admin-card">
            <div className="new-campaign-admin-kicker">Planificación de medios</div>
            <div className="new-campaign-admin-title">Crear campaña para este cliente</div>
            <div className="new-campaign-admin-sub">Define las ubicaciones y el periodo de exhibición.</div>

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
              <div className="new-campaign-admin-hint">
                Puedes agrupar varias ubicaciones dentro de una sola campaña.
              </div>
              <div className="new-campaign-panel-list">
                {panelesState.status === "loading" && (
                  <div className="premium-inline-loader new-campaign-panels-loading" role="status"><span aria-hidden="true" />Actualizando paneles</div>
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
            <div className="new-campaign-admin-dates" style={{ display: "flex", gap: 10 }}>
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
          <button type="button" className="campaign-admin-submit" onClick={crearContrato} disabled={creando} style={{
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
      <div className="campaign-request-screen">
        <div className="detail-header campaign-request-header">
          <BackButton onClick={onEnviada} />
          <div className="simple-title">{tituloSolicitud}</div>
          <div style={{ width: 32 }} />
        </div>
        <div className="campaign-request-scroll campaign-request-success-scroll">
          <div className="new-campaign-success-wrap campaign-request-success">
            <CampaignFormProgress complete />
            <div className="campaign-request-success-card">
              <div className="campaign-request-success-icon">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <div className="campaign-request-success-title">
                {enviadoYaExistia ? "Solicitud en proceso" : "Solicitud recibida"}
              </div>
              <div className="campaign-request-success-message">
                {enviadoYaExistia
                  ? "Tu solicitud ya está siendo atendida. Nuestro equipo se comunicará contigo a la brevedad para coordinar los siguientes pasos."
                  : "La solicitud fue enviada correctamente. Nuestro equipo la revisará y se comunicará contigo a la brevedad para coordinar los siguientes pasos."}
              </div>
            </div>
          </div>
        </div>
        <div className="campaign-request-footer">
          <button type="button" className="campaign-request-submit" onClick={onEnviada}>
            Listo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="campaign-request-screen">
      <div className="detail-header campaign-request-header">
        <BackButton onClick={onBack} />
        <div className="simple-title">{tituloSolicitud}</div>
        <div style={{ width: 32 }} />
      </div>

      <div className="campaign-request-scroll">
        <div className="campaign-request-card">
          <div className="campaign-request-card-heading">
            <h1>{tituloSolicitud}</h1>
            <p>{panelFijo
              ? esRenovacion
                ? "Indícanos cuándo quieres continuar. Confirmaremos las fechas y los siguientes pasos."
                : "Cuéntanos cuándo te gustaría empezar. Confirmaremos el espacio y te enviaremos los siguientes pasos."
              : "Cuéntanos qué tienes en mente. Te ayudaremos a encontrar una ubicación adecuada."}</p>
          </div>

          {error && (
            <div className="campaign-request-error" role="alert">
              {error}
            </div>
          )}

          {panelFijo ? (
            <div className="campaign-request-panel" aria-label="Espacio seleccionado">
              <span><strong>{panelFijo.nombre}</strong><small>{ciudad || "Ubicación seleccionada"}</small></span>
              <b>Ubicación elegida</b>
            </div>
          ) : null}
          {panelFijo && !esRenovacion && (
            <Field label="¿Qué necesitas?">
              <div className="campaign-request-choices" role="group" aria-label="Tipo de solicitud">
                <button type="button" className={tipoConsulta === "espacio" ? "is-active" : ""} aria-pressed={tipoConsulta === "espacio"} onClick={() => setTipoConsulta("espacio")}>
                  <span className="campaign-request-choice-mark" aria-hidden="true">{tipoConsulta === "espacio" ? "✓" : ""}</span>
                  <span><strong>Este espacio</strong><small>Consultar fechas para este mural.</small></span>
                </button>
                <button type="button" className={tipoConsulta === "alternativas" ? "is-active" : ""} aria-pressed={tipoConsulta === "alternativas"} onClick={() => setTipoConsulta("alternativas")}>
                  <span className="campaign-request-choice-mark" aria-hidden="true">{tipoConsulta === "alternativas" ? "✓" : ""}</span>
                  <span><strong>Ver alternativas</strong><small>Recibir opciones similares en {ciudad || "esta ciudad"}.</small></span>
                </button>
              </div>
            </Field>
          )}
          <Field label="Nombre de la campaña">
            <input style={inputStyle} maxLength={MAX_NOMBRE} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Lanzamiento de temporada" />
          </Field>
          {!panelFijo && (
            <Field label="Ciudad">
              <select style={selectStyle} value={ciudad} onChange={(e) => setCiudad(e.target.value)}>
                {CIUDADES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          )}
          <div className="campaign-request-field-row">
            <Field label="Inicio deseado">
              <input style={inputStyle} type="date" min={hoyStr} value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
            </Field>
            <Field label="Duración">
              <div className="campaign-request-duration" role="group" aria-label="Duración de la campaña">
                {[3, 6, 12].map((n) => (
                  <button key={n} type="button" onClick={() => setMeses(n)} className={meses === n ? "is-active" : ""} aria-pressed={meses === n}>
                    {n} meses
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <div className="campaign-request-hint">
            El plazo mínimo es de 3 meses.
            {fechaInicio && (
              <> Periodo estimado hasta el <strong>{fechaLarga(sumarMeses(fechaInicio, meses))}</strong>.</>
            )}
          </div>
          <Field label="Detalles adicionales">
            <textarea style={inputStyle} maxLength={MAX_COMENTARIOS} value={comentarios} onChange={(e) => setComentarios(e.target.value)} placeholder="Objetivo, fechas flexibles o consultas…" />
          </Field>
          <div className="campaign-request-summary" aria-live="polite"><span>Resumen</span><strong>{panelFijo ? tipoConsulta === "alternativas" && !esRenovacion ? `Alternativas en ${ciudad || "tu ciudad"}` : panelFijo.nombre : ciudad} · {meses} meses</strong></div>
          <button type="button" className="campaign-request-submit" onClick={enviar} disabled={enviando}>
            {enviando ? "Enviando…" : "Enviar solicitud"}
          </button>
          <p className="campaign-request-privacy">La solicitud no reserva el espacio. Te confirmaremos la disponibilidad.</p>
        </div>
      </div>
    </div>
  );
}
