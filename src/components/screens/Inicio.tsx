import { useRef } from "react";
import type { Cliente, Contrato, Panel } from "../../types";
import { estadoCampana, panelesDeContrato } from "../../types";
import { useResumenInformes } from "../../hooks/useResumenInformes";
import { usePushEstado } from "../../hooks/usePushEstado";
import NotifPrompt from "../NotifPrompt";
import { PersonIcon } from "../PersonIcon";
import { BrandThumb } from "../BrandThumb";

interface Props {
  cliente: Cliente | null;
  clienteId: string;
  contratos: Contrato[];
  paneles: Record<string, Panel>;
  onGoTo: (tab: "campanas" | "cobertura" | "reportes" | "nueva" | "facturas" | "mispantallas" | "nuevoCliente" | "perfil") => void;
  onAbrirCampana?: (contrato: Contrato) => void;
  onMenuClick?: () => void;
  onNotifClick?: () => void;
  onCambiarCliente?: () => void;
  totalNotifs?: number;
  isAdmin?: boolean;
  adminNombre?: string | null;
  esGerente?: boolean;
  uid?: string;
  mostrarNotifSpotlight?: boolean;
  onCerrarNotifSpotlight?: () => void;
}

function fechaGeneradoInforme(createdAt: unknown): string {
  if (createdAt && typeof createdAt === "object" && "toDate" in createdAt) {
    const toDate = (createdAt as { toDate?: () => Date }).toDate;
    if (typeof toDate === "function") return fechaCorta(toDate().toISOString().slice(0, 10));
  }
  if (typeof createdAt === "string") {
    const parsed = new Date(createdAt);
    if (!Number.isNaN(parsed.getTime())) return fechaCorta(parsed.toISOString().slice(0, 10));
  }
  return "—";
}

function proximoVencimiento(contratos: Contrato[]): Contrato | null {
  return contratos
    .filter((contrato) => estadoCampana(contrato) !== "Finalizada")
    .sort((a, b) => a.fin.localeCompare(b.fin))[0] ?? null;
}

function diasHasta(fecha: string): number {
  const destino = new Date(`${fecha}T23:59:59`).getTime();
  if (!Number.isFinite(destino)) return 0;
  return Math.max(0, Math.ceil((destino - Date.now()) / 86_400_000));
}

function fechaCorta(fecha: string) {
  if (!fecha) return "—";
  const date = new Date(`${fecha.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return fecha;
  return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric" })
    .format(date)
    .replace(".", "");
}

const HEADER = "#050A12";

export default function Inicio({ cliente, clienteId, contratos, paneles: _paneles, onGoTo, onAbrirCampana: _onAbrirCampana, onMenuClick, onNotifClick, onCambiarCliente, totalNotifs = 0, isAdmin, adminNombre, esGerente, uid, mostrarNotifSpotlight, onCerrarNotifSpotlight }: Props) {
  const { estado: estadoPush, error: errorPush, activar: activarPush } = usePushEstado(uid);
  const notifBtnRef = useRef<HTMLButtonElement>(null);
  const activas = contratos.filter(c => estadoCampana(c) === "Activa");
  const pantallasActivas = new Set(activas.flatMap((contrato) => panelesDeContrato(contrato))).size;
  const mesActual = new Date().toISOString().slice(0, 7);
  const informesState = useResumenInformes(clienteId, mesActual);
  const ultimoInforme = informesState.status === "ready" ? informesState.ultimoInforme : null;
  // Para la tarjeta de "Reporte del mes" en Próximos pasos -- ¿ya existe
  // un informe generado para el mes en curso? (mismo criterio que usa
  // Mis Campañas para su barra de "Estado de reportes"). Con esto la
  // tarjeta muestra una situación real en vez de un texto fijo.
  const NOMBRES_MES_LARGO = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  const nombreMesActual = NOMBRES_MES_LARGO[Number(mesActual.slice(5, 7)) - 1] ?? "este mes";
  const reporteEsteMesListo = informesState.status === "ready" && informesState.reporteEsteMesListo;
  const proxVenc = proximoVencimiento(contratos);
  const campanaRenovable = [...activas].sort((a, b) => a.fin.localeCompare(b.fin))[0] ?? null;
  const diasRenovacion = campanaRenovable ? diasHasta(campanaRenovable.fin) : null;
  const todoOk = activas.length > 0 || contratos.length === 0;
  // "esGerente === false" es la única forma de saber que se trata de
  // un Trabajador y no del Gerente -- si esGerente no llega definido
  // (pantallas viejas que todavía no lo pasan) se asume Gerente, que
  // es el único rol interno que existía antes de este cambio.
  const rolInterno = esGerente === false ? "Trabajador" : "Gerente";
  const nombre = isAdmin ? (adminNombre || rolInterno) : (cliente?.empresa ?? "Cliente");
  // Hora de Peru (America/Lima, UTC-5 fijo, sin horario de verano) en vez
  // de la hora local del dispositivo, para que el saludo sea correcto sin
  // importar en que zona horaria este configurado el celular del cliente.
  const hora = Number(
    new Intl.DateTimeFormat("es-PE", { hour: "numeric", hourCycle: "h23", timeZone: "America/Lima" }).format(new Date())
  );
  // Entre medianoche y las 04:59 sigue siendo noche. Antes se tomaba
  // cualquier hora menor a 12 como mañana y por eso a la 1 a. m. aparecía
  // "Buenos días".
  const saludo = hora < 5 ? "Buenas noches" : hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
  const headerBg = "#050A12";

  return (
    <div
      className={`inicio-screen ${isAdmin ? "inicio-screen-admin" : "inicio-screen-client"}`}
      style={{ display:"flex", flexDirection:"column", height:"100%", background: HEADER }}
    >

      {/* ── HEADER ── */}
      <div className="inicio-header" style={{ padding:"calc(14px + env(safe-area-inset-top)) 22px 42px", flexShrink:0, background:headerBg }}>
        {/* Logo + menú + campana */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", position:"relative", marginBottom:30 }}>
          {/* Botón menú lateral ☰ — solo visible en móvil, en escritorio el nav siempre está abierto */}
          <button
            type="button"
            aria-label="Abrir menú"
            onClick={onMenuClick}
            className="mobile-menu-btn inicio-header-icon-btn"
            style={{ position:"absolute", left:0 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div className="inicio-desktop-page-title" aria-hidden="true">
            <span />
            <strong>Inicio</strong>
          </div>
          <img src="/logo-player.webp" decoding="async" alt="Vista360 Player" className="inicio-logo" style={{ height:28, maxWidth:"64%", objectFit:"contain" }} />
          <div style={{ position:"absolute", right:0, display:"flex", alignItems:"center", gap:10 }}>
            <button
              type="button"
              className="inicio-profile-top-btn"
              onClick={() => onGoTo("perfil")}
              aria-label="Perfil"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21a8 8 0 0 0-16 0" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>Perfil</span>
            </button>
            {estadoPush !== "activado" && estadoPush !== "oculto" ? (
              // A propósito, el botón se queda como "Activar" (nunca se
              // convierte en la campanita normal) en CUALQUIER estado
              // que no sea "activado" -- ofrecer, activando, bloqueado
              // o error. Pedido explícito: la campana solo puede
              // aparecer una vez que las notificaciones de verdad ya
              // quedaron permitidas, nunca antes.
              <button
                ref={notifBtnRef}
                type="button"
                onClick={() => activarPush(uid)}
                disabled={estadoPush === "activando"}
                className="inicio-activar-push-btn"
                aria-label="Activar notificaciones"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                <span>
                  {estadoPush === "activando" ? "Activando…" : estadoPush === "bloqueado" ? "Bloqueado" : "Activar"}
                </span>
              </button>
            ) : (
              <button
                type="button"
                aria-label="Notificaciones"
                onClick={onNotifClick}
                className="inicio-header-icon-btn"
                style={{
                  position:"relative",
                }}
              >
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.9" strokeLinecap="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {totalNotifs > 0 && (
                  <div style={{
                    position:"absolute", top:-5, right:-5,
                    minWidth:20, height:20,
                    background:"#EF4444", borderRadius:"50%",
                    border:"2px solid #0B2243",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize: totalNotifs > 9 ? 9 : 11, color:"#fff", fontWeight:900,
                    padding: totalNotifs > 9 ? "0 4px" : 0,
                    boxShadow:"none",
                  }}>
                    {totalNotifs > 9 ? "9+" : totalNotifs}
                  </div>
                )}
              </button>
            )}
          </div>
        </div>
        {/* Saludo */}
        <div className={`inicio-greeting-title${isAdmin ? " inicio-greeting-title-admin" : ""}`} style={{ fontSize:18, fontWeight:800, color:"#fff", marginBottom:isAdmin ? 4 : 7, letterSpacing:0, lineHeight:1.1 }}>
          {saludo}, {isAdmin ? rolInterno : nombre}
        </div>
        <div className={`inicio-greeting-sub${isAdmin ? " inicio-greeting-sub-admin" : ""}`} style={{ fontSize:isAdmin ? 12.5 : 14, color:"rgba(255,255,255,0.72)", marginBottom:isAdmin ? 5 : 16, lineHeight:1.35 }}>
          {isAdmin ? <>Gestiona tus clientes y campañas<br className="inicio-greeting-admin-break" />{" "}desde aquí.</> : "Tu presencia publicitaria, clara y bajo control."}
        </div>
        {/* Pill */}
        {!isAdmin && (
          <div className="inicio-status-pill" style={{ display:"inline-flex", alignItems:"center", gap:6, background:"rgba(255,255,255,0.13)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:20, padding:"5px 11px", boxShadow:"0 12px 28px rgba(0,0,0,0.18)" }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:"#22C55E" }} />
            <span style={{ fontSize:11.5, color:"#fff", fontWeight:650 }}>{todoOk ? "Todo funcionando" : "Revisa tus campañas"}</span>
          </div>
        )}
      </div>

      {/* ── FONDO BLANCO CON CURVA ── */}
      <div className="inicio-content" style={{ flex:1, overflowY:"auto", overflowX:"hidden", background:"#F7F9FC", borderRadius:"26px 26px 0 0", marginTop:-26, padding:"18px 18px 10px", WebkitOverflowScrolling:"touch" as any, overscrollBehavior:"contain" }}>

        {isAdmin && (
          <div className="inicio-admin-actions" style={{ display:"grid", gridTemplateColumns:"1fr", gap:10, marginBottom:14 }}>
            <button
              type="button"
              onClick={onCambiarCliente}
              className="inicio-current-client"
            >
              <span className="inicio-current-client-mark" aria-hidden="true">
                <BrandThumb
                  name={cliente?.empresa || "Cliente"}
                  avatarKey={cliente?.avatarKey}
                  avatarUrl={cliente?.avatarUrl}
                  size={40}
                  radius={12}
                  iconScale={0.72}
                  priority
                />
              </span>
              <span className="inicio-current-client-copy">
                <small>Cuenta seleccionada · {rolInterno}</small>
                <strong>{cliente?.empresa || "Cliente"}</strong>
              </span>
              <span className="inicio-current-client-action">
                Cambiar cliente
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </span>
            </button>
          </div>
        )}

        <section className="inicio-desktop-welcome" aria-label={`${saludo}, ${nombre}`}>
          <div className="inicio-desktop-welcome-copy">
            <span className="inicio-desktop-welcome-kicker">
              {isAdmin ? "Centro de gestión" : "Vista360 Player"}
            </span>
            <h2>{saludo}, <strong>{nombre}</strong></h2>
            <p>
              {isAdmin
                ? "Tus clientes, campañas y resultados en una sola vista."
                : "Tu presencia publicitaria, clara y bajo control."}
            </p>
          </div>
          <div className={`inicio-desktop-welcome-status${!isAdmin && !todoOk ? " is-alert" : ""}`}>
            <span aria-hidden="true" />
            {isAdmin ? "Gestión centralizada" : todoOk ? "Todo funcionando" : "Revisa tus campañas"}
          </div>
        </section>

        <div className="inicio-section-title inicio-summary-title" style={{ fontSize:17, fontWeight:800, color:"#08122B", marginBottom:12 }}>
          Resumen general
        </div>
        <div className="inicio-summary-grid" style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)", gap:10, marginBottom:18 }}>
          {[
            {
              bg:"#EEF4FF", label:"Campañas activas", val:String(activas.length),
              icon:<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#0877FF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-5"/></svg>,
            },
            {
              bg:"#EAF3FF", label:"Publicidades activas", val:String(pantallasActivas), onClick:() => onGoTo("campanas"),
              icon:<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#0877FF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>,
            },
            {
              bg:"#F1F5F9", label:"Último reporte", val:ultimoInforme ? ultimoInforme.mesLabel : "—", onClick:() => onGoTo("reportes"),
              icon:<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#0B3F8A" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
            },
            {
              bg:"#FFFFFF", label:"Próximo vencimiento", val:proxVenc ? fechaCorta(proxVenc.fin) : "—",
              icon:<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#111B2D" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>,
            },
          ].map((item) => (
            <div
              key={item.label}
              className={`inicio-kpi-card${item.label === "Último reporte" ? " inicio-kpi-card-report" : item.label === "Próximo vencimiento" ? " inicio-kpi-card-date" : ""}`}
              onClick={item.onClick}
              style={{ background:"#fff", border:"1px solid #E2E8F0", borderRadius:8, padding:"12px 11px", minHeight:78, minWidth:0, display:"flex", alignItems:"center", gap:9, boxShadow:"0 14px 30px rgba(15,23,42,0.06)", cursor:item.onClick ? "pointer" : "default" }}
            >
              <div className="inicio-kpi-icon" style={{ width:38, height:38, borderRadius:20, background:item.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                {item.icon}
              </div>
              <div className="inicio-kpi-body" style={{ minWidth:0, flex:1 }}>
                <div className="inicio-kpi-label" style={{ fontSize:12, color:"#111827", marginBottom:4, lineHeight:1.12 }}>{item.label}</div>
                {/* fontSize mas chico que antes (17->14): en celular
                    "Ultimo reporte" (ej. "Julio 2026") se cortaba con
                    puntos suspensivos; "Proximo vencimiento" (fecha
                    corta) ya entraba bien, pero se baja parejo para
                    las 4 tarjetas asi quedan consistentes. En
                    escritorio no cambia nada -- ahi el CSS lo pisa con
                    !important (19px). */}
                <div className="inicio-kpi-value" style={{ fontSize:14, fontWeight:800, color:"#08122B", lineHeight:1.08, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{item.val}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="inicio-dashboard-grid">
        <div className="inicio-main-col">
        {/* ACCESOS RÁPIDOS — título suelto, íconos directos sin card exterior */}
        <div className="inicio-section-title" style={{ fontSize:17, fontWeight:800, color:"#08122B", marginBottom:12 }}>Accesos rápidos</div>
        <div className="inicio-quick-grid" style={{ display:"grid", gridTemplateColumns:"repeat(4, minmax(0,1fr))", gap:9, marginBottom:18 }}>
          {[
            // Orden a proposito: "Nueva campaña" primero (la accion mas
            // frecuente), "Mi perfil" siempre al final (es la de menos
            // uso de las 4). "Mis pantallas" ya no es un destino propio
            // -- ese contenido se fusiono adentro de "Campañas" (ver
            // comentario en Sidebar.tsx), asi que ya no se referencia
            // desde ningun lado. "Mis campañas" tampoco va aca: ya es
            // una pestaña principal (bottom nav / sidebar), repetirla
            // en Accesos rapidos no sumaba nada.
            { bg:"#FFFFFF", label:"Nueva campaña", description:"Crea una nueva solicitud", tab:"nueva" as const,
              icon:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#111B2D" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> },
            { bg:"#FFFFFF", label:"Cobertura", description:"Revisa tus ubicaciones", tab:"cobertura" as const,
              icon:<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0877FF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg> },
            { bg:"#FFFFFF", label:"Facturas", description:"Consulta y descarga documentos", tab:"facturas" as const,
              icon:<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0B3F8A" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></svg> },
            { bg:"#FFFFFF", label:"Mi perfil", description:"Tus datos y accesos", tab:"perfil" as const,
              icon:<PersonIcon size={24} color="#0877FF" /> },
          ].map(q => (
            <button type="button" key={q.tab} onClick={() => onGoTo(q.tab)} style={{ minHeight:78, padding:0, background:q.bg, color:"inherit", border:"1px solid #E2E8F0", borderRadius:8, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:7, cursor:"pointer", WebkitTapHighlightColor:"transparent", boxShadow:"0 12px 26px rgba(15,23,42,0.05)", font:"inherit" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:28 }}>
                {q.icon}
              </div>
              <div className="inicio-quick-copy">
                <span style={{ fontSize: 11, color:"#08122B", fontWeight:650, textAlign:"center", lineHeight:1.12 }}>{q.label}</span>
                <small>{q.description}</small>
              </div>
            </button>
          ))}
        </div>

        </div>
        <div className="inicio-side-col">
        {/* ÚLTIMO REPORTE — sí es una card (igual al mockup) */}
        <div className="inicio-evidence-card" style={{ background:"#fff", border:"1px solid #E2E8F0", borderRadius:8, padding:"18px", boxShadow:"0 18px 38px rgba(15,23,42,0.07)" }}>
          <div className="inicio-report-title" style={{ fontSize:18, fontWeight:800, color:"#08122B", marginBottom:14 }}>Último reporte</div>
          {informesState.status === "loading" ? (
            <div className="premium-inline-loader inicio-report-loading" role="status">
              <span aria-hidden="true" />
              Actualizando información
            </div>
          ) : ultimoInforme ? (
            <div className="inicio-report-row" style={{ display:"flex", gap:16, alignItems:"center" }}>
              <div className="inicio-report-icon" style={{ width:56, height:70, borderRadius:12, flexShrink:0, background:"#123778", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#BFD5FF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 1.5h10.5L23 8v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V3.5A2 2 0 0 1 7 1.5Z" />
                  <path d="M17 1.5V7a2 2 0 0 0 2 2h4" />
                </svg>
              </div>
              <div className="inicio-report-body" style={{ flex:1 }}>
                <div className="inicio-report-month" style={{ fontSize:17, fontWeight:800, color:"#08122B", marginBottom:8, lineHeight:1.28 }}>
                  {ultimoInforme.mesLabel}
                </div>
                <div className="inicio-report-meta" style={{ display:"flex", alignItems:"center", gap:8, color:"#52627A", fontSize: 14, marginBottom:16 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#52627A" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  Generado el {fechaGeneradoInforme(ultimoInforme.createdAt)}
                </div>
                <button type="button" className="inicio-report-link" onClick={() => onGoTo("reportes")} style={{ display:"inline-flex", alignItems:"center", gap:4, padding:0, border:"none", background:"transparent", color:"#0877FF", fontSize:16, fontWeight:800, fontFamily:"inherit", cursor:"pointer" }}>
                  Ver reportes <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0877FF" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            </div>
          ) : (
            <div style={{ color:"#64748B", fontSize:14, padding:"4px 0" }}>Aún no hay reportes registrados.</div>
          )}
        </div>
        </div>
        </div>

        <section className="inicio-account-status">
          <div className="inicio-account-status-head">
            <div>
              <h2>Continúa aquí</h2>
            </div>
            <div className="inicio-account-status-badge">
              <i aria-hidden="true" />
              Acciones recomendadas
            </div>
          </div>
          <div className="inicio-account-status-grid">
            {/* El boton de "Solicitar renovacion" vive en la pantalla
                Campañas (MisCampanas.tsx), no en el detalle de una
                campaña individual -- por eso esta tarjeta siempre lleva
                ahi, sin importar si hay o no una campaña por vencer. */}
            <button type="button" onClick={() => onGoTo("campanas")}>
              <div className="inicio-account-status-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.8-2L20 9M4 15l2.1 2a7 7 0 0 0 11.8-2"/></svg>
              </div>
              <div>
                <span>{isAdmin ? "Gestionar renovación" : "Renovar campaña"}</span>
                <strong>{campanaRenovable ? (campanaRenovable.nombre || "Campaña activa") : "Todo al día"}</strong>
                <small>
                  {campanaRenovable
                    ? `${diasRenovacion} ${diasRenovacion === 1 ? "día" : "días"} para finalizar`
                    : "No hay renovaciones pendientes"}
                </small>
              </div>
              <svg className="inicio-account-status-arrow" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m9 18 6-6-6-6"/></svg>
            </button>
            {/* Reporte del mes -- antes decia siempre "Amplia tu presencia
                / Explorar cobertura", un texto fijo sin relacion con la
                cuenta real. Ahora refleja si el informe de ESTE mes ya
                existe o no (mismo dato que usa la barra de "Estado de
                reportes" en Mis Campañas), asi que dice algo distinto
                segun corresponda en vez de repetir siempre lo mismo. */}
            <button type="button" onClick={() => onGoTo("reportes")}>
              <div className="inicio-account-status-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              </div>
              <div>
                <span>Reporte mensual</span>
                <strong>
                  {reporteEsteMesListo
                    ? `Reporte de ${nombreMesActual} listo`
                    : isAdmin
                      ? `Genera el reporte de ${nombreMesActual}`
                      : `Reporte de ${nombreMesActual} pendiente`}
                </strong>
                <small>
                  {reporteEsteMesListo
                    ? "Ya puedes verlo y compartirlo"
                    : isAdmin
                      ? "El cliente todavía no lo tiene"
                      : "Te avisamos apenas esté listo"}
                </small>
              </div>
              <svg className="inicio-account-status-arrow" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m9 18 6-6-6-6"/></svg>
            </button>
            {/* Tercera tarjeta -- con cero campañas activas, pide crear
                la primera (unico "proximo paso" que tiene sentido en
                ese momento). Con al menos una activa, en vez de solo
                repetir un numero que ya se ve arriba en "Resumen
                general" (Publicidades activas), se usa ese mismo dato
                como gancho para una oportunidad real de crecimiento --
                sumar mas cobertura -- en vez de quedarse en informativo
                nomas. "Mis pantallas" ya no se referencia como destino
                propio: ese contenido se fusiono adentro de "Campañas"
                (ver Sidebar.tsx). */}
            {activas.length === 0 ? (
              <button type="button" onClick={() => onGoTo("nueva")}>
                <div className="inicio-account-status-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>
                </div>
                <div>
                  <span>{isAdmin ? "Nueva oportunidad" : "Impulsa tu marca"}</span>
                  <strong>{isAdmin ? "Crear nueva campaña" : "Solicitar nueva campaña"}</strong>
                  <small>{isAdmin ? "Registra una propuesta para el cliente" : "Cuéntanos qué deseas promocionar"}</small>
                </div>
                <svg className="inicio-account-status-arrow" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m9 18 6-6-6-6"/></svg>
              </button>
            ) : (
              <button type="button" onClick={() => onGoTo("cobertura")}>
                <div className="inicio-account-status-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>
                </div>
                <div>
                  <span>{pantallasActivas} {pantallasActivas === 1 ? "pantalla activa" : "pantallas activas"}</span>
                  <strong>Amplía tu presencia</strong>
                  <small>Explora cobertura y suma mas ubicaciones</small>
                </div>
                <svg className="inicio-account-status-arrow" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m9 18 6-6-6-6"/></svg>
              </button>
            )}
          </div>
        </section>

      </div>
      {mostrarNotifSpotlight && onCerrarNotifSpotlight && (
        <NotifPrompt
          uid={uid}
          targetRef={notifBtnRef}
          estadoPush={estadoPush}
          errorPush={errorPush}
          activarPush={activarPush}
          onClose={onCerrarNotifSpotlight}
        />
      )}
    </div>
  );
}
