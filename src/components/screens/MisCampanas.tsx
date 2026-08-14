import { useState, type CSSProperties } from "react";
import { mensajeDeError } from "../../utils/errores";
import { httpsCallable } from "firebase/functions";
import type { CampanaEstado, Contrato, Panel } from "../../types";
import { diasHasta, fechaCorta, hoyEnPeru, progresoCampana, soloFecha, sumarDias } from "../../utils/fechas";
import { estadoCampana, panelesDeContrato } from "../../types";
import { useContratosHistoricos } from "../../hooks/useContratos";
import { useInformes } from "../../hooks/useInformes";
import { cloudFunctions } from "../../config/firebase";
import ClientScreenHeader from "../ClientScreenHeader";
import { campaignCityImage } from "../../utils/campaignCity";
import { formatCampaignName } from "../../utils/campaignName";
import { useDialogos } from "../DialogosProvider";

function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  );
}

// Numero real de WhatsApp del negocio (Alan Martinez, Director
// General) -- mismo numero que ya aparece como contacto en el PDF de
// reportes. Antes era un placeholder de mentira (51999999999), que
// nunca llegaba a ningun lado real cuando un cliente lo usaba.
const WHATSAPP_NUMERO = "51947957971";

interface Props {
  contratos: Contrato[];
  paneles: Record<string, Panel>;
  clienteNombre: string;
  onAbrir: (contrato: Contrato) => void;
  onNueva: () => void;
  isAdmin?: boolean;
  clienteId?: string;
  onMenuClick?: () => void;
  onNotifClick?: () => void;
  totalNotifs?: number;
}

const BADGE: Record<string, { bg: string; color: string }> = {
  Activa:    { bg: "rgba(34,197,94,0.15)",  color: "#16A34A" },
  Programada:{ bg: "rgba(8,119,255,0.15)", color: "#0877FF" },
  Finalizada:{ bg: "rgba(107,114,128,0.12)",color: "#64748B" },
};

// Ambas delegan en utils/fechas -- antes usaban new Date(c.fin), que
// interpreta "2026-07-31" como medianoche UTC y adelantaba el cálculo
// casi un día entero en Perú (ver el comentario de utils/fechas.ts).
function progreso(c: Contrato): number {
  return progresoCampana(c.inicio, c.fin);
}

function diasParaVencer(c: Contrato): number {
  return diasHasta(c.fin);
}

type RenovacionEstado = "idle" | "confirmando" | "enviando" | "enviada" | "error";

export default function MisCampanas({ contratos, paneles, onAbrir, onNueva, isAdmin, clienteId, onMenuClick, onNotifClick, totalNotifs }: Props) {
  // Arranca en "Activa" (no "Todas") -- se pidio que al entrar a
  // Campanas siempre se vea primero lo mas relevante/urgente (lo que
  // esta corriendo ahora), no la lista completa mezclada con
  // programadas y finalizadas.
  const [filtro, setFiltro] = useState<"Todas"|"Activa"|"Programada"|"Finalizada">("Activa");
  const [modal, setModal] = useState<{ contrato: Contrato; panelNombre: string; ciudad: string; estado: RenovacionEstado; solicitudId?: string; error?: string; yaExistia?: boolean } | null>(null);
  const [renovadas, setRenovadas] = useState<Set<string>>(new Set());
  const [menuAbiertoId, setMenuAbiertoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const { confirmar, avisar } = useDialogos();
  const [editando, setEditando] = useState<{
    contrato: Contrato;
    nombre: string;
    inicio: string;
    fin: string;
    guardando: boolean;
    error: string;
  } | null>(null);
  // Siempre en el mismo orden sin importar como vengan del origen:
  // primero las Activas (lo mas urgente/relevante ahora), despues las
  // Programadas (lo que viene), y al final las Finalizadas (ya no
  // requieren accion). Dentro de cada grupo se respeta el orden
  // original (sort estable).
  const ORDEN_ESTADO: Record<CampanaEstado, number> = { Activa: 0, Programada: 1, Finalizada: 2 };

  // EL HISTORIAL SE PIDE SOLO CUANDO SE MIRA.
  //
  // La aplicación entera trabaja con las campañas VIGENTES (ver
  // useContratos): son las únicas que necesitan Cobertura, las
  // notificaciones y las facturas. Esta pantalla es el único sitio que
  // enseña las terminadas, y solo en dos de sus cuatro pestañas.
  //
  // Traerlas siempre significaba que un cliente de diez años pagaba
  // cuarenta documentos en CADA sesión aunque nunca abriera esta
  // pantalla. Ahora la consulta cara -- la que crece con los años -- se
  // dispara únicamente al pulsar "Finalizadas" o "Todas".
  const quiereHistorial = filtro === "Finalizada" || filtro === "Todas";
  const historialState = useContratosHistoricos(clienteId ?? "", quiereHistorial);
  const cargandoHistorial = quiereHistorial && historialState.status === "loading";

  // Al pedir el historial llega TAMBIÉN lo vigente (es la misma consulta
  // sin el filtro de fecha), así que se deduplica por id en vez de
  // concatenar: si no, cada campaña activa saldría dos veces en "Todas".
  const visibles = (() => {
    if (!quiereHistorial) return contratos;
    if (historialState.status !== "ready") return contratos;
    const porId = new Map<string, Contrato>();
    [...contratos, ...historialState.contratos].forEach((c) => porId.set(c.id, c));
    return [...porId.values()];
  })();

  const filtradas = visibles
    .filter((c) => filtro === "Todas" || estadoCampana(c) === filtro)
    .slice()
    .sort((a, b) => ORDEN_ESTADO[estadoCampana(a)] - ORDEN_ESTADO[estadoCampana(b)]);
  const informesState = useInformes(isAdmin ? clienteId ?? "" : "");
  const mesActual = new Date().toISOString().slice(0, 7);
  const NOMBRES_MES_LARGO = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  const nombreMesActual = NOMBRES_MES_LARGO[Number(mesActual.slice(5, 7)) - 1] ?? "este mes";
  // Por campaña: solo importa si YA se subió/generó algún reporte
  // este mes o no -- el admin pidió explícitamente que no se cuenten
  // paneles (el reporte va por campaña completa, sea de 1 o de 2+
  // paneles), así que da igual cuántos paneles tenga.
  const informesDelMes = informesState.status === "ready"
    ? informesState.informes.filter((i) => i.mes === mesActual)
    : [];
  const campanasActivasMes = contratos.filter((c) => estadoCampana(c) === "Activa");
  const estadosMesCampanas = campanasActivasMes.map((c) => {
    const idsPaneles = panelesDeContrato(c);
    const panelNombreLocal = idsPaneles.length > 1
      ? idsPaneles.map((id) => paneles[id]?.nombre ?? id).join(" + ")
      : (paneles[c.panel_id]?.nombre ?? c.panel_id);
    const nombreCampana = formatCampaignName(c.nombre || panelNombreLocal);
    const listo = informesDelMes.some((i) => i.contratoId === c.id);
    return {
      id: c.id,
      listo,
      texto: listo
        ? `${nombreCampana}: informe de ${nombreMesActual} enviado`
        : `${nombreCampana}: falta generar informe de ${nombreMesActual}`,
    };
  });

  async function eliminarCampana(c: Contrato, panelNombre: string) {
    if (!cloudFunctions || eliminandoId) return;
    const confirmado = await confirmar({
      titulo: "¿Eliminar esta campaña?",
      mensaje: `Se borrará el contrato de "${panelNombre}". No se puede deshacer.`,
      textoConfirmar: "Eliminar",
      destructivo: true,
    });
    if (!confirmado) return;
    setMenuAbiertoId(null);
    setEliminandoId(c.id);
    try {
      const fn = httpsCallable<{ contratoId: string }, { ok: boolean; pendiente?: boolean }>(cloudFunctions, "eliminarContrato");
      const res = await fn({ contratoId: c.id });
      if (res.data.pendiente) {
        await avisar({
          titulo: "Enviado para aprobación",
          mensaje: `Tu Gerente debe aprobar la eliminación de la campaña de "${panelNombre}".`,
        });
      }
    } catch (err) {
      await avisar({
        titulo: "No se pudo eliminar la campaña",
        mensaje: err instanceof Error ? err.message : "Vuelve a intentarlo en un momento.",
        esError: true,
      });
    } finally {
      setEliminandoId(null);
    }
  }

  function abrirEdicion(c: Contrato, panelNombre: string) {
    setMenuAbiertoId(null);
    setEditando({
      contrato: c,
      nombre: c.nombre || panelNombre,
      inicio: c.inicio,
      fin: c.fin,
      guardando: false,
      error: "",
    });
  }

  async function guardarEdicion() {
    if (!editando || !cloudFunctions) return;
    const nombre = formatCampaignName(editando.nombre);
    if (!nombre) {
      setEditando({ ...editando, error: "Escribe el nombre de la campaña." });
      return;
    }
    if (!editando.inicio || !editando.fin) {
      setEditando({ ...editando, error: "Completa las dos fechas." });
      return;
    }
    if (editando.fin < editando.inicio) {
      setEditando({ ...editando, error: "La fecha de fin no puede ser anterior al inicio." });
      return;
    }
    setEditando({ ...editando, guardando: true, error: "" });
    try {
      const fn = httpsCallable<
        { contratoId: string; nombre: string; inicio: string; fin: string },
        { ok: boolean }
      >(cloudFunctions, "actualizarContrato");
      await fn({
        contratoId: editando.contrato.id,
        nombre,
        inicio: editando.inicio,
        fin: editando.fin,
      });
      setEditando(null);
    } catch (error) {
      setEditando({ ...editando, guardando: false, error: mensajeDeError(error, "No se pudo actualizar la campaña.") });
    }
  }

  function abrirConfirmacion(c: Contrato, panelNombre: string, ciudad: string, e: React.MouseEvent) {
    e.stopPropagation();
    setModal({ contrato: c, panelNombre, ciudad, estado: "confirmando" });
  }

  async function confirmarRenovacion() {
    if (!modal || !cloudFunctions || !clienteId) return;
    setModal({ ...modal, estado: "enviando" });
    try {
      // Antes esto era un addDoc directo a Firestore, y por eso mismo
      // dejó de funcionar: al agregarle ciudad y fechas (ver el porqué
      // más abajo) empezó a mandar campos que las reglas de
      // "solicitudesCampana" no tenían contempladas, y Firestore lo
      // rechazaba con "permission-denied" ("No tienes permiso para
      // hacer esto.") -- el código estaba bien, el problema era que ya
      // no dependía solo de él. Ahora pasa por Admin SDK
      // (crearSolicitudCampana), igual que el resto de escrituras
      // sensibles de esta app, así que un campo nuevo en el formulario
      // no puede volver a romper esto.
      //
      // Mismos campos que crea Nueva campaña (y Cobertura, que pasa por
      // ahí): antes esta era la única ruta que seguía escribiendo
      // "objetivo" -- un campo que ya se quitó del formulario -- y que
      // NO guardaba ciudad ni fechas, así que en la pantalla de
      // Solicitudes el admin veía "Inicio deseado" y "Fin deseado" en
      // blanco y no tenía forma de saber desde cuándo la quería el
      // cliente. Ahora las tres rutas guardan la misma forma.
      const finActual = soloFecha(modal.contrato.fin);
      const inicioSugerido = finActual ? sumarDias(finActual, 1) : hoyEnPeru();
      const fn = httpsCallable<
        {
          clienteId: string; nombre: string; ciudades: string[]; comentarios: string;
          fechaInicioDeseada: string; fechaFinDeseada: string | null;
        },
        { ok: boolean; id: string; yaExistia?: boolean }
      >(cloudFunctions, "crearSolicitudCampana");
      const res = await fn({
        clienteId,
        nombre: `Renovación — ${modal.panelNombre}`,
        ciudades: modal.ciudad ? [modal.ciudad] : [],
        comentarios: `Renovación de la campaña en el panel "${modal.panelNombre}"${modal.ciudad ? ` (${modal.ciudad})` : ""}, que vence el ${finActual}.`,
        // Arranca justo al día siguiente de que vence la actual, que es
        // lo que se quiere al renovar: que no quede un hueco sin salir.
        fechaInicioDeseada: inicioSugerido,
        fechaFinDeseada: null,
      });
      setRenovadas((prev) => new Set(prev).add(modal.contrato.id));
      setModal({ ...modal, estado: "enviada", solicitudId: res.data.id, yaExistia: res.data.yaExistia });
    } catch (error) {
      setModal({ ...modal, estado: "error", error: mensajeDeError(error, "No se pudo enviar la solicitud.") });
    }
  }

  const whatsappHref = modal
    ? `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(
        `Hola, acabo de solicitar la renovación de "${modal.panelNombre}" desde Vista360 Player. ¿Podemos coordinar el pago?`
      )}`
    : "#";

  return (
    <div className="mis-campanas-screen" style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>
      <ClientScreenHeader
        title="Campañas"
        className="campanas-header"
        onMenuClick={onMenuClick}
        onNotifClick={onNotifClick}
        totalNotifs={totalNotifs}
      />

      {/* Tabs */}
      <div className="campanas-filter-bar" role="tablist" aria-label="Filtrar campañas por estado">
        {(["Activa","Programada","Finalizada","Todas"] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filtro === f}
            className={`campanas-filter-tab${filtro === f ? " active" : ""}`}
            onClick={() => setFiltro(f)}
          >
            {f === "Activa" ? "Activas" : f === "Programada" ? "Programadas" : f === "Finalizada" ? "Finalizadas" : f}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="mis-campanas-list" style={{ flex: 1, overflowY: "auto", padding: "14px 16px 20px", background: "#F8F9FB" }}>
        {/* Un solo cuadro para todas las campañas -- antes era un
         *  cuadro separado por cada campaña activa, y con varias
         *  campañas quedaban un montón de cajas apiladas. Ahora es UN
         *  cuadro con una fila adentro por campaña (se pidió
         *  explícitamente: "un cuadro nada más, no dos"). */}
        {isAdmin && estadosMesCampanas.length > 0 && (
          <div className="mis-campanas-month-status">
            <div className="mis-campanas-month-status-header">
              <img src="/vista360-assistant-icon.svg" decoding="async" alt="" aria-hidden="true" />
              <span>Estado de reportes</span>
            </div>
            {estadosMesCampanas.map((e) => (
              <div key={e.id} className={`mis-campanas-month-status-row ${e.listo ? "is-sent" : "is-pending"}`}>
                {e.texto}
              </div>
            ))}
          </div>
        )}

        {/* Mientras llega el historial NO se puede mostrar el vacío: la
            persona pulsa "Finalizadas" y vería "no tienes campañas"
            durante un instante, que es justo lo contrario de la verdad. */}
        {cargandoHistorial && (
          <div
            style={{ padding: "48px 28px", textAlign: "center", color: "#64748B", fontSize: 14 }}
            role="status"
            aria-live="polite"
          >
            Cargando el historial…
          </div>
        )}

        {!cargandoHistorial && filtradas.length === 0 && (
          <div className="mis-campanas-empty" style={{
            display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
            padding: "56px 28px 40px", marginTop: 12,
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%", flexShrink: 0,
              background: "radial-gradient(circle at 32% 28%, rgba(8,119,255,0.16), rgba(8,119,255,0.06))",
              display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18,
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0877FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 11v2a1 1 0 0 0 1 1h2l4.2 4.2a1 1 0 0 0 1.7-.7V6.5a1 1 0 0 0-1.7-.7L6 10H4a1 1 0 0 0-1 1Z" />
                <path d="M17 8c1.3 1.1 2 2.6 2 4s-.7 2.9-2 4" />
                <path d="M19.5 5.5c2.1 1.8 3.3 4 3.3 6.5s-1.2 4.7-3.3 6.5" />
              </svg>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#0B1220" }}>
              {filtro === "Todas"
                ? "Todavía no tienes campañas"
                : filtro === "Activa"
                ? "No tienes campañas activas"
                : filtro === "Programada"
                ? "No tienes campañas programadas"
                : "No tienes campañas finalizadas"}
            </div>
            <div style={{ fontSize: 13, color: "#64748B", marginTop: 6, maxWidth: 260, lineHeight: 1.5 }}>
              Anímate a lanzar tu próxima campaña y dale visibilidad a tu marca en los mejores paneles.
            </div>
            <button
              type="button"
              onClick={onNueva}
              style={{
                marginTop: 20, padding: "11px 22px", borderRadius: 999, border: "none",
                background: "#0877FF", color: "#fff", fontSize: 13.5, fontWeight: 700,
                cursor: "pointer", boxShadow: "0 6px 16px rgba(8,119,255,0.28)",
              }}
            >
              Lanzar nueva campaña
            </button>
          </div>
        )}

        {filtradas.map((c, index) => {
          const estado = estadoCampana(c);
          const badge = BADGE[estado] ?? BADGE.Finalizada;
          const pct = progreso(c);
          const idsPanelesCampana = panelesDeContrato(c);
          const panelNombre = idsPanelesCampana.length > 1
            ? idsPanelesCampana.map((id) => paneles[id]?.nombre ?? id).join(" + ")
            : (paneles[c.panel_id]?.nombre ?? c.panel_id);
          // Si el admin le puso nombre a la campaña, ese es el titulo de
          // la tarjeta -- si no, se sigue mostrando el nombre del/los
          // panel(es), como antes.
          const tituloCampana = formatCampaignName(c.nombre || panelNombre);
          // La ciudad del primer panel de la campaña -- va en la
          // solicitud de renovación para que llegue con la misma forma
          // que las que se crean desde Nueva campaña / Cobertura.
          const ciudadCampana = paneles[idsPanelesCampana[0]]?.ciudad ?? "";
          const cityStyle = {
            "--campaign-city-image": `url("${campaignCityImage(c.id)}")`,
          } as CSSProperties;
          return (
            // Tres capas, cada una con un solo trabajo (ver comentario
            // largo junto a .premium-campaign-card-lift en app.css):
            // -hit detecta click/hover y nunca se mueve ni recorta nada.
            // -lift solo se mueve (translateY), sin imagen de fondo ni
            //  esquinas redondeadas propias -- moverla es barato.
            // -card (adentro) tiene el recorte de esquinas + la imagen
            //  de fondo, pero nunca se transforma a si misma.
            <div
              key={c.id}
              className={`premium-campaign-card-hit${filtradas.length % 2 === 1 && index === filtradas.length - 1 ? " premium-campaign-card-last-single" : ""}`}
              onClick={() => onAbrir(c)}
              role="button"
              tabIndex={0}
              aria-label={`Abrir campaña ${tituloCampana}`}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
                e.preventDefault();
                onAbrir(c);
              }}
            >
              <div className="premium-campaign-card-lift">
              <div className="premium-campaign-card" style={cityStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="premium-campaign-kicker">CAMPAÑA PUBLICITARIA</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div className="premium-campaign-title">{tituloCampana}</div>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", background: badge.bg, borderRadius: 8, padding: "2px 8px", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: badge.color }}>{estado}</span>
                </div>
                <div className="premium-campaign-meta">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/></svg>
                  {panelNombre}
                </div>
                <div className="premium-campaign-meta premium-campaign-date">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  {fechaCorta(c.inicio)} – {fechaCorta(c.fin)}
                </div>
                {estado !== "Finalizada" && (
                  <div>
                    <div className="premium-campaign-progress">
                      <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#0877FF,#52A5FF)", borderRadius: 4, transition: "width .3s" }} />
                    </div>
                    <div className="premium-campaign-progress-label">{pct}% completado</div>
                  </div>
                )}
                {!isAdmin && estado === "Activa" && diasParaVencer(c) <= 14 && diasParaVencer(c) >= 0 && (
                  renovadas.has(c.id) ? (
                    <div className="campaign-renewal-sent">
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="m8 12 2.6 2.6L16.5 9" />
                      </svg>
                      <span>Solicitud de renovación enviada</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="campaign-renewal-button"
                      onClick={(e) => abrirConfirmacion(c, panelNombre, ciudadCampana, e)}
                    >
                      <img
                        className="campaign-renewal-icon"
                        src="/auto-renewal-2-circle-fill-svgrepo-com.svg"
                        alt=""
                        aria-hidden="true"
                        draggable={false}
                      />
                      <span>
                        <small>Vence en {diasParaVencer(c)} día(s)</small>
                        <strong>Solicitar renovación</strong>
                      </span>
                    </button>
                  )
                )}
              </div>
              {isAdmin && (
                <div className="campaign-card-actions">
                  <div style={{ position: "relative" }} onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      className="campaign-config-button"
                      aria-label={`Configurar campaña ${tituloCampana}`}
                      aria-haspopup="menu"
                      aria-expanded={menuAbiertoId === c.id}
                      aria-controls={`campaign-actions-${c.id}`}
                      onClick={() => setMenuAbiertoId((actual) => (actual === c.id ? null : c.id))}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.4v-.1A1.7 1.7 0 0 0 8 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 3.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H1.8V9.4h.1A1.7 1.7 0 0 0 3.6 8a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.06 3.2l.06.06A1.7 1.7 0 0 0 8 3.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V1.8h4.2v.1A1.7 1.7 0 0 0 15 3.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8c.12.4.34.75.65 1 .3.25.68.4 1.05.4h.1v4.2h-.1A1.7 1.7 0 0 0 19.4 15Z" />
                      </svg>
                      <span>Configurar</span>
                    </button>
                    {menuAbiertoId === c.id && (
                      <div id={`campaign-actions-${c.id}`} className="report-card-menu-dropdown campaign-config-menu" role="menu">
                        <button
                          type="button"
                          className="report-card-menu-item neutral"
                          role="menuitem"
                          onClick={() => abrirEdicion(c, panelNombre)}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                          Editar campaña
                        </button>
                        <button
                          type="button"
                          className="report-card-menu-item"
                          role="menuitem"
                          onClick={() => void eliminarCampana(c, panelNombre)}
                          disabled={eliminandoId === c.id}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/></svg>
                          {eliminandoId === c.id ? "Eliminando..." : "Eliminar campaña"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              </div>
              </div>
            </div>
          );
        })}

        {/* Nueva campaña CTA -- texto y botón son una sola unidad para
            que el grid de escritorio no los mande a columnas distintas. */}
        {filtradas.length > 0 && (
          <div className="mis-campanas-cta">
            <div>¿Quieres lanzar una nueva campaña?</div>
            <button type="button" onClick={onNueva}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
              Nueva campaña
            </button>
          </div>
        )}
      </div>

      {editando && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Editar campaña"
          onClick={() => !editando.guardando && setEditando(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 520, background: "rgba(3,7,14,.68)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 18,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%", maxWidth: 470, borderRadius: 20, background: "#FFFFFF",
              boxShadow: "0 28px 70px rgba(2,6,23,.34)", padding: 22,
            }}
          >
            <div style={{ fontSize: 19, fontWeight: 850, color: "#0B1220", marginBottom: 5 }}>
              Editar campaña
            </div>
            <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.45, marginBottom: 20 }}>
              Actualiza el nombre y la vigencia de la campaña.
            </div>

            <label htmlFor="editar-nombre-campana" style={{ display: "block", color: "#475569", fontSize: 12, fontWeight: 750, marginBottom: 6 }}>
              Nombre de la campaña
            </label>
            <input
              id="editar-nombre-campana"
              autoFocus
              value={editando.nombre}
              onChange={(event) => setEditando({ ...editando, nombre: event.target.value, error: "" })}
              disabled={editando.guardando}
              style={{
                width: "100%", boxSizing: "border-box", border: "1.5px solid #DCE3EC",
                borderRadius: 12, padding: "12px 13px", background: "#FFFFFF", color: "#0B1220",
                fontSize: 14, outline: "none", marginBottom: 16,
              }}
            />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <label style={{ color: "#475569", fontSize: 12, fontWeight: 750 }}>
                Fecha de inicio
                <input
                  type="date"
                  value={editando.inicio}
                  onChange={(event) => setEditando({ ...editando, inicio: event.target.value, error: "" })}
                  disabled={editando.guardando}
                  style={{
                    display: "block", width: "100%", boxSizing: "border-box", marginTop: 6,
                    border: "1.5px solid #DCE3EC", borderRadius: 12, padding: "11px 10px",
                    background: "#FFFFFF", color: "#0B1220", fontSize: 13,
                  }}
                />
              </label>
              <label style={{ color: "#475569", fontSize: 12, fontWeight: 750 }}>
                Fecha de fin
                <input
                  type="date"
                  value={editando.fin}
                  onChange={(event) => setEditando({ ...editando, fin: event.target.value, error: "" })}
                  disabled={editando.guardando}
                  style={{
                    display: "block", width: "100%", boxSizing: "border-box", marginTop: 6,
                    border: "1.5px solid #DCE3EC", borderRadius: 12, padding: "11px 10px",
                    background: "#FFFFFF", color: "#0B1220", fontSize: 13,
                  }}
                />
              </label>
            </div>

            {editando.error && (
              <div style={{ color: "#DC2626", background: "#FEF2F2", borderRadius: 12, padding: "9px 11px", fontSize: 12, marginTop: 14 }}>
                {editando.error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setEditando(null)}
                disabled={editando.guardando}
                style={{
                  flex: 1, border: "none", borderRadius: 12, padding: 13, background: "#F1F5F9",
                  color: "#334155", fontSize: 14, fontWeight: 750, cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void guardarEdicion()}
                disabled={editando.guardando}
                style={{
                  flex: 1, border: "none", borderRadius: 12, padding: 13,
                  background: editando.guardando ? "#93C5FD" : "#0877FF",
                  color: "#FFFFFF", fontSize: 14, fontWeight: 800,
                  cursor: editando.guardando ? "default" : "pointer",
                }}
              >
                {editando.guardando ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación / éxito — en el mismo lugar, sin salir de la pantalla */}
      {modal && (
        <div
          onClick={() => (modal.estado === "confirmando" || modal.estado === "error") && setModal(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(13,22,41,0.55)", zIndex: 500,
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: "20px 20px 0 0", padding: "22px 20px",
              width: "100%", maxWidth: 480, boxShadow: "0 -8px 30px rgba(0,0,0,0.2)",
            }}
          >
            {(modal.estado === "confirmando" || modal.estado === "enviando") && (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#0B1220", marginBottom: 6 }}>
                  ¿Confirmas la renovación?
                </div>
                <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5, marginBottom: 20 }}>
                  Vamos a solicitar renovar <strong style={{ color: "#0B1220" }}>{modal.panelNombre}</strong> por
                  un mes más. Nuestro equipo te contactará para coordinar el pago.
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button"
                    onClick={() => setModal(null)}
                    disabled={modal.estado === "enviando"}
                    style={{
                      flex: 1, padding: "13px", background: "#F3F4F6", border: "none", borderRadius: 12,
                      color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer",
                    }}
                  >
                    Cancelar
                  </button>
                  <button type="button"
                    onClick={confirmarRenovacion}
                    disabled={modal.estado === "enviando"}
                    style={{
                      flex: 1, padding: "14px", background: "#0877FF", border: "none", borderRadius: 12,
                      color: "#fff", fontWeight: 700, fontSize: 14,
                      cursor: modal.estado === "enviando" ? "not-allowed" : "pointer",
                    }}
                  >
                    {modal.estado === "enviando" ? "Enviando…" : "Confirmar y enviar"}
                  </button>
                </div>
              </>
            )}

            {modal.estado === "enviada" && (
              <>
                <div style={{ textAlign: "center", marginBottom: 6 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: "50%", background: "rgba(34,197,94,0.12)",
                    display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px",
                  }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0B1220", marginBottom: 6 }}>
                    {modal.yaExistia ? "Ya habías enviado esta solicitud" : "Solicitud enviada"}
                  </div>
                  <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5, marginBottom: 20 }}>
                    {modal.yaExistia
                      ? "La pediste hoy mismo hace un rato -- no hacía falta mandarla de nuevo, ya está en camino. Alguien del equipo se va a comunicar contigo pronto."
                      : "Alguien del equipo se va a comunicar contigo pronto. Si quieres, también puedes escribirnos directo por WhatsApp."}
                  </div>
                </div>
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    width: "100%", padding: "13px", background: "#22C55E", borderRadius: 12,
                    color: "#fff", fontWeight: 700, fontSize: 14, textDecoration: "none", boxSizing: "border-box",
                  }}
                >
                  <WhatsAppIcon /> Escríbenos para coordinar el pago
                </a>

                <button type="button"
                  onClick={() => setModal(null)}
                  style={{
                    width: "100%", padding: "12px", background: "none", border: "none",
                    color: "#64748B", fontWeight: 600, fontSize: 13, cursor: "pointer", marginTop: 4,
                  }}
                >
                  Listo, cerrar
                </button>
              </>
            )}

            {modal.estado === "error" && (
              <>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#DC2626", marginBottom: 6 }}>
                  No se pudo enviar
                </div>
                <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5, marginBottom: 20 }}>
                  {modal.error ?? "Revisa tu conexión e intenta de nuevo, o escríbenos directo."}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button"
                    onClick={() => setModal(null)}
                    style={{
                      flex: 1, padding: "13px", background: "#F3F4F6", border: "none", borderRadius: 12,
                      color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer",
                    }}
                  >
                    Cerrar
                  </button>
                  <button type="button"
                    onClick={confirmarRenovacion}
                    style={{
                      flex: 1, padding: "14px", background: "#0877FF", border: "none", borderRadius: 12,
                      color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
                    }}
                  >
                    Reintentar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
