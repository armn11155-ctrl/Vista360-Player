import type { Cliente, Contrato, Panel } from "../../types";
import { estadoCampana, panelesDeContrato } from "../../types";
import { useFacturas } from "../../hooks/useFacturas";
import { useInformes } from "../../hooks/useInformes";

interface Props {
  cliente: Cliente | null;
  clienteId: string;
  contratos: Contrato[];
  paneles: Record<string, Panel>;
  onGoTo: (tab: "campanas" | "reportes" | "nueva" | "facturas" | "mispantallas" | "nuevoCliente" | "perfil") => void;
  onMenuClick?: () => void;
  onNotifClick?: () => void;
  onCambiarCliente?: () => void;
  totalNotifs?: number;
  isAdmin?: boolean;
  adminNombre?: string | null;
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
  return contratos.filter(c => estadoCampana(c) !== "Finalizada").sort((a,b) => a.fin.localeCompare(b.fin))[0] ?? null;
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

export default function Inicio({ cliente, clienteId, contratos, paneles, onGoTo, onMenuClick, onNotifClick, onCambiarCliente, totalNotifs = 0, isAdmin, adminNombre }: Props) {
  const activas = contratos.filter(c => estadoCampana(c) === "Activa");
  const pantallasActivas = new Set(activas.flatMap(c => panelesDeContrato(c))).size;
  const informesState = useInformes(clienteId);
  const ultimoInforme = informesState.status === "ready" ? informesState.informes[0] ?? null : null;
  const proxVenc = proximoVencimiento(contratos);
  const todoOk = activas.length > 0 || contratos.length === 0;
  const nombre = isAdmin ? (adminNombre || "Admin") : (cliente?.empresa ?? "Cliente");
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
  const facturasState = useFacturas(isAdmin ? undefined : cliente?.ruc);
  const facturasPendientes = facturasState.status === "ready"
    ? facturasState.facturas.filter((f) => f.estado === "Pendiente" || f.estado === "Vencida").length
    : 0;
  const headerBg = "#050A12";

  return (
    <div className="inicio-screen" style={{ display:"flex", flexDirection:"column", height:"100%", background: HEADER }}>

      {/* ── HEADER ── */}
      <div className="inicio-header" style={{ padding:"calc(14px + env(safe-area-inset-top)) 22px 42px", flexShrink:0, background:headerBg, borderBottom:"3px solid #0877FF" }}>
        {/* Logo + menú + campana */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", position:"relative", marginBottom:24 }}>
          {/* Botón menú lateral ☰ — solo visible en móvil, en escritorio el nav siempre está abierto */}
          <div
            onClick={onMenuClick}
            className="mobile-menu-btn"
            style={{ position:"absolute", left:0, width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </div>
          <img src="/logo-player.png" alt="Vista360 Player" className="inicio-logo" style={{ height:36, maxWidth:"64%", objectFit:"contain" }} />
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
            <div
              onClick={onNotifClick}
              style={{
                position:"relative",
                width:38,
                height:38,
                borderRadius:19,
                display:"flex",
                alignItems:"center",
                justifyContent:"center",
                cursor:"pointer",
                background:"rgba(255,255,255,0.10)",
                border:"1px solid rgba(255,255,255,0.14)",
                boxShadow:"0 12px 26px rgba(0,0,0,0.16)",
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
            </div>
          </div>
        </div>
        {/* Saludo */}
        <div className={`inicio-greeting-title${isAdmin ? " inicio-greeting-title-admin" : ""}`} style={{ fontSize:isAdmin ? 19 : 27, fontWeight:800, color:"#fff", marginBottom:isAdmin ? 4 : 7, letterSpacing:0, lineHeight:1.1 }}>
          {saludo}, {isAdmin ? "Admin" : nombre}
        </div>
        <div className={`inicio-greeting-sub${isAdmin ? " inicio-greeting-sub-admin" : ""}`} style={{ fontSize:isAdmin ? 12.5 : 14, color:"rgba(255,255,255,0.72)", marginBottom:isAdmin ? 5 : 16, lineHeight:1.35 }}>
          {isAdmin ? <>Gestiona tus clientes y campañas<br className="inicio-greeting-admin-break" />desde aquí.</> : "Tu presencia publicitaria, clara y bajo control."}
        </div>
        {/* Pill */}
        {!isAdmin && (
          <div className="inicio-status-pill" style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.13)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:22, padding:"7px 13px", boxShadow:"0 12px 28px rgba(0,0,0,0.18)" }}>
            <div style={{ width:9, height:9, borderRadius:"50%", background:"#22C55E" }} />
            <span style={{ fontSize:13, color:"#fff", fontWeight:650 }}>{todoOk ? "Todo funcionando" : "Revisa tus campañas"}</span>
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
              style={{ background:"#0B1220", color:"#fff", border:"none", borderRadius:13, minHeight:64, padding:"12px", textAlign:"left", cursor:"pointer", boxShadow:"0 8px 20px rgba(15,23,42,0.12)" }}
            >
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.66)", marginBottom:3 }}>Admin</div>
              <div style={{ fontSize:14, fontWeight:800, lineHeight:1.15 }}>Cambiar cliente</div>
            </button>
          </div>
        )}

        {/* RESUMEN GENERAL — título suelto, cards individuales */}
        <div className="inicio-section-title" style={{ fontSize:17, fontWeight:800, color:"#08122B", marginBottom:12 }}>Resumen general</div>
        <div className="inicio-summary-grid" style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)", gap:10, marginBottom:18 }}>
          {[
            { bg:"#EEF4FF", label:"Campañas activas", val:String(activas.length),
              icon:<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#0877FF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-5"/></svg> },
            { bg:"#EAF3FF", label:"Publicidades activas", val:String(pantallasActivas), onClick: () => onGoTo("mispantallas"),
              icon:<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#0877FF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> },
            { bg:"#F1F5F9", label:"Último reporte", val:ultimoInforme ? ultimoInforme.mesLabel : "—", onClick: () => onGoTo("reportes"),
              icon:<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#0B3F8A" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> },
            { bg:"#FFFFFF", label:"Próximo vencimiento", val:proxVenc ? fechaCorta(proxVenc.fin) : "—",
              icon:<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#111B2D" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg> },
            ...(!isAdmin ? [{
              bg:"#EAF3FF", label:"Facturas pendientes", val:String(facturasPendientes), valColor:"#0B3F8A",
              icon:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0B3F8A" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
              onClick: () => onGoTo("facturas"),
            }] : []),
          ].map((k,i) => (
            <div
              key={i}
              onClick={k.onClick}
              style={{ background:"#fff", border:"1px solid #E2E8F0", borderRadius:8, padding:"12px 11px", minHeight:78, minWidth:0, display:"flex", alignItems:"center", gap:9, boxShadow:"0 14px 30px rgba(15,23,42,0.06)", cursor: k.onClick ? "pointer" : "default" }}
            >
              <div style={{ width:38, height:38, borderRadius:19, background:k.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                {k.icon}
              </div>
              <div style={{ minWidth:0, flex:1 }}>
                <div style={{ fontSize: 12, color:"#111827", marginBottom:4, lineHeight:1.12 }}>{k.label}</div>
                <div style={{ fontSize:17, fontWeight:800, color:k.valColor ?? "#08122B", lineHeight:1.08, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{k.val}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ACCESOS RÁPIDOS — título suelto, íconos directos sin card exterior */}
        <div className="inicio-divider" style={{ height:1, background:"#E6EAF1", marginBottom:16 }} />
        <div className="inicio-section-title" style={{ fontSize:17, fontWeight:800, color:"#08122B", marginBottom:12 }}>Accesos rápidos</div>
        <div className="inicio-quick-grid" style={{ display:"grid", gridTemplateColumns:"repeat(4, minmax(0,1fr))", gap:9, marginBottom:18 }}>
          {[
            { bg:"#FFFFFF", label:"Mis campañas", tab:"campanas" as const,
              icon:<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0877FF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11v3a2 2 0 0 0 2 2h2l6 4V5L7 9H5a2 2 0 0 0-2 2z"/><path d="M16 9a4 4 0 0 1 0 6"/></svg> },
            { bg:"#FFFFFF", label:"Mis publicidades", tab:"mispantallas" as const,
              icon:<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0877FF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg> },
            { bg:"#FFFFFF", label:"Reportes", tab:"reportes" as const,
              icon:<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0B3F8A" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="7" x2="19" y2="7"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="5" y1="17" x2="19" y2="17"/></svg> },
            { bg:"#FFFFFF", label:"Nueva campaña", tab:"nueva" as const,
              icon:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#111B2D" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> },
          ].map(q => (
            <div key={q.tab} onClick={() => onGoTo(q.tab)} style={{ minHeight:78, background:q.bg, border:"1px solid #E2E8F0", borderRadius:8, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:7, cursor:"pointer", WebkitTapHighlightColor:"transparent", boxShadow:"0 12px 26px rgba(15,23,42,0.05)" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:28 }}>
                {q.icon}
              </div>
              <span style={{ fontSize: 11, color:"#08122B", fontWeight:650, textAlign:"center", lineHeight:1.12 }}>{q.label}</span>
            </div>
          ))}
        </div>

        {/* ÚLTIMO REPORTE — sí es una card (igual al mockup) */}
        <div className="inicio-evidence-card" style={{ background:"#fff", border:"1px solid #E2E8F0", borderRadius:8, padding:"18px", boxShadow:"0 18px 38px rgba(15,23,42,0.07)" }}>
          <div style={{ fontSize:18, fontWeight:800, color:"#08122B", marginBottom:14 }}>Último reporte</div>
          {informesState.status === "loading" ? (
            <div style={{ color:"#9CA3AF", fontSize:14, padding:"4px 0" }}>Cargando…</div>
          ) : ultimoInforme ? (
            <div style={{ display:"flex", gap:16, alignItems:"center" }}>
              <div style={{ width:56, height:70, borderRadius:10, flexShrink:0, background:"#123778", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#BFD5FF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 1.5h10.5L23 8v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V3.5A2 2 0 0 1 7 1.5Z" />
                  <path d="M17 1.5V7a2 2 0 0 0 2 2h4" />
                </svg>
              </div>
              <div style={{ flex:1, paddingTop:2 }}>
                <div style={{ fontSize:17, fontWeight:800, color:"#08122B", marginBottom:8, lineHeight:1.28 }}>
                  {ultimoInforme.mesLabel}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8, color:"#52627A", fontSize: 14, marginBottom:16 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#52627A" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  Generado el {fechaGeneradoInforme(ultimoInforme.createdAt)}
                </div>
                <div onClick={() => onGoTo("reportes")} style={{ display:"inline-flex", alignItems:"center", gap:4, color:"#0877FF", fontSize:16, fontWeight:800, cursor:"pointer" }}>
                  Ver reportes <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0877FF" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color:"#9CA3AF", fontSize:14, padding:"4px 0" }}>Aún no hay reportes registrados.</div>
          )}
        </div>

        <div style={{ height:8 }} />
      </div>
    </div>
  );
}
