import type { Cliente, Contrato, FotoCampania, Panel } from "../../types";
import { estadoCampana } from "../../types";
import { cloudinaryThumb } from "../../utils/cloudinaryUrl";
import { useFacturas } from "../../hooks/useFacturas";

interface Props {
  cliente: Cliente | null;
  contratos: Contrato[];
  paneles: Record<string, Panel>;
  onGoTo: (tab: "campanas" | "reportes" | "nueva" | "facturas" | "mispantallas" | "nuevoCliente") => void;
  onMenuClick?: () => void;
  onNotifClick?: () => void;
  onCambiarCliente?: () => void;
  totalNotifs?: number;
  isAdmin?: boolean;
  adminNombre?: string | null;
}

function ultimaFoto(contratos: Contrato[]): { foto: FotoCampania; panel?: string } | null {
  let best: { foto: FotoCampania; panel?: string } | null = null;
  for (const c of contratos)
    for (const f of c.fotos_campania ?? [])
      if (!best || f.fecha > best.foto.fecha) best = { foto: f, panel: c.panel_id };
  return best;
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

const HEADER = "#07152A";

export default function Inicio({ cliente, contratos, paneles, onGoTo, onMenuClick, onNotifClick, onCambiarCliente, totalNotifs = 0, isAdmin, adminNombre }: Props) {
  const activas = contratos.filter(c => estadoCampana(c) === "Activa");
  const pantallasActivas = new Set(activas.map(c => c.panel_id)).size;
  const ultima = ultimaFoto(contratos);
  const proxVenc = proximoVencimiento(contratos);
  const todoOk = activas.length > 0 || contratos.length === 0;
  const nombre = isAdmin ? (adminNombre || "Admin") : (cliente?.empresa ?? "Cliente");
  const hora = new Date().getHours();
  const saludo = hora < 12 ? "Buenos días," : hora < 19 ? "Buenas tardes," : "Buenas noches,";
  const facturasState = useFacturas(isAdmin ? undefined : cliente?.ruc);
  const facturasPendientes = facturasState.status === "ready"
    ? facturasState.facturas.filter((f) => f.estado === "Pendiente" || f.estado === "Vencida").length
    : 0;
  const headerBg = "radial-gradient(circle at 50% 0%, #123E7A 0%, #0B2243 38%, #07152A 76%)";

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background: HEADER }}>

      {/* ── HEADER ── */}
      <div style={{ padding:"calc(14px + env(safe-area-inset-top)) 22px 42px", flexShrink:0, background:headerBg }}>
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
          <div style={{ position:"absolute", right:0, display:"flex", alignItems:"center" }}>
            <div
              onClick={onNotifClick}
              style={{ position:"relative", width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {totalNotifs > 0 && (
                <div style={{
                  position:"absolute", top:3, right:3,
                  minWidth:18, height:18,
                  background:"#EF4444", borderRadius:"50%",
                  border:`2px solid ${HEADER}`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize: totalNotifs > 9 ? 9 : 10, color:"#fff", fontWeight:800,
                  padding: totalNotifs > 9 ? "0 3px" : 0,
                }}>
                  {totalNotifs > 9 ? "9+" : totalNotifs}
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Saludo */}
        <div style={{ fontSize:14, color:"rgba(255,255,255,0.86)", marginBottom:4 }}>{saludo}</div>
        <div style={{ fontSize:27, fontWeight:800, color:"#fff", marginBottom:16, letterSpacing:0, lineHeight:1.05 }}>
          {isAdmin ? "Hola Admin" : nombre}
        </div>
        {/* Pill */}
        <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.13)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:22, padding:"7px 13px", boxShadow:"0 12px 28px rgba(0,0,0,0.18)" }}>
          <div style={{ width:9, height:9, borderRadius:"50%", background:"#22C55E" }} />
          <span style={{ fontSize:13, color:"#fff", fontWeight:650 }}>{todoOk ? "Todo funcionando" : "Revisa tus campañas"}</span>
        </div>
      </div>

      {/* ── FONDO BLANCO CON CURVA ── */}
      <div style={{ flex:1, overflowY:"auto", background:"#F8FAFD", borderRadius:"26px 26px 0 0", marginTop:-26, padding:"18px 18px 10px", WebkitOverflowScrolling:"touch" as any, overscrollBehavior:"contain" }}>

        {isAdmin && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
            <button
              type="button"
              onClick={onCambiarCliente}
              style={{ background:"#0D1629", color:"#fff", border:"none", borderRadius:13, minHeight:64, padding:"12px", textAlign:"left", cursor:"pointer", boxShadow:"0 8px 20px rgba(15,23,42,0.12)" }}
            >
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.66)", marginBottom:3 }}>Admin</div>
              <div style={{ fontSize:14, fontWeight:800, lineHeight:1.15 }}>Cambiar cliente</div>
            </button>
            <button
              type="button"
              onClick={() => onGoTo("nuevoCliente")}
              style={{ background:"#2563EB", color:"#fff", border:"none", borderRadius:13, minHeight:64, padding:"12px", textAlign:"left", cursor:"pointer", boxShadow:"0 8px 20px rgba(37,99,235,0.18)" }}
            >
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.72)", marginBottom:3 }}>Accesos</div>
              <div style={{ fontSize:14, fontWeight:800, lineHeight:1.15 }}>Crear nuevo cliente</div>
            </button>
          </div>
        )}

        {/* RESUMEN GENERAL — título suelto, cards individuales */}
        <div style={{ fontSize:17, fontWeight:800, color:"#08122B", marginBottom:12 }}>Resumen general</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:18 }}>
          {[
            { bg:"#DBEAFE", label:"Campañas activas", val:String(activas.length),
              icon:<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-5"/></svg> },
            { bg:"#DCFCE7", label:"Pantallas activas", val:String(pantallasActivas), onClick: () => onGoTo("mispantallas"),
              icon:<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> },
            { bg:"#EDE9FE", label:"Última evidencia", val:ultima ? ultima.foto.fecha : "—",
              icon:<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> },
            { bg:"#FFEDD5", label:"Próximo vencimiento", val:proxVenc ? fechaCorta(proxVenc.fin) : "—",
              icon:<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg> },
            ...(!isAdmin ? [{
              bg:"#FEE2E2", label:"Facturas pendientes", val:String(facturasPendientes),
              icon:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
              onClick: () => onGoTo("facturas"),
            }] : []),
          ].map((k,i) => (
            <div
              key={i}
              onClick={k.onClick}
              style={{ background:"#fff", border:"1px solid #E8EDF5", borderRadius:13, padding:"11px 10px", minHeight:76, display:"flex", alignItems:"center", gap:9, boxShadow:"0 7px 16px rgba(15,23,42,0.04)", cursor: k.onClick ? "pointer" : "default" }}
            >
              <div style={{ width:38, height:38, borderRadius:19, background:k.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                {k.icon}
              </div>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize: 12, color:"#111827", marginBottom:4, lineHeight:1.12 }}>{k.label}</div>
                <div style={{ fontSize:17, fontWeight:800, color:"#08122B", lineHeight:1.08, whiteSpace:"nowrap" }}>{k.val}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ACCESOS RÁPIDOS — título suelto, íconos directos sin card exterior */}
        <div style={{ height:1, background:"#E6EAF1", marginBottom:16 }} />
        <div style={{ fontSize:17, fontWeight:800, color:"#08122B", marginBottom:12 }}>Accesos rápidos</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:9, marginBottom:18 }}>
          {[
            { bg:"#FFFFFF", label:"Mis campañas", tab:"campanas" as const,
              icon:<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11v3a2 2 0 0 0 2 2h2l6 4V5L7 9H5a2 2 0 0 0-2 2z"/><path d="M16 9a4 4 0 0 1 0 6"/></svg> },
            { bg:"#FFFFFF", label:"Mis pantallas", tab:"mispantallas" as const,
              icon:<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg> },
            { bg:"#FFFFFF", label:"Reportes", tab:"reportes" as const,
              icon:<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="7" x2="19" y2="7"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="5" y1="17" x2="19" y2="17"/></svg> },
            { bg:"#FFFFFF", label:"Nueva campaña", tab:"nueva" as const,
              icon:<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> },
          ].map(q => (
            <div key={q.tab} onClick={() => onGoTo(q.tab)} style={{ minHeight:78, background:q.bg, border:"1px solid #E8EDF5", borderRadius:13, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:7, cursor:"pointer", WebkitTapHighlightColor:"transparent", boxShadow:"0 7px 16px rgba(15,23,42,0.035)" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:28 }}>
                {q.icon}
              </div>
              <span style={{ fontSize: 11, color:"#08122B", fontWeight:650, textAlign:"center", lineHeight:1.12 }}>{q.label}</span>
            </div>
          ))}
        </div>

        {/* ÚLTIMA EVIDENCIA — sí es una card (igual al mockup) */}
        <div style={{ background:"#fff", border:"1px solid #E8EDF5", borderRadius:18, padding:"18px", boxShadow:"0 10px 24px rgba(15,23,42,0.045)" }}>
          <div style={{ fontSize:18, fontWeight:800, color:"#08122B", marginBottom:14 }}>Última evidencia recibida</div>
          {ultima ? (
            <div style={{ display:"flex", gap:20, alignItems:"flex-start" }}>
              <div style={{ width:168, height:118, borderRadius:12, overflow:"hidden", flexShrink:0, background:"#F3F4F6" }}>
                <img
                  src={cloudinaryThumb(ultima.foto.url, 320)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  style={{ width:"100%", height:"100%", objectFit:"cover" }}
                />
              </div>
              <div style={{ flex:1, paddingTop:2 }}>
                <div style={{ fontSize:17, fontWeight:800, color:"#08122B", marginBottom:18, lineHeight:1.28 }}>
                  Pantalla: {paneles[ultima.panel ?? ""]?.nombre ?? ultima.panel}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8, color:"#52627A", fontSize: 14, marginBottom:28 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#52627A" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  {ultima.foto.fecha}
                </div>
                <div onClick={() => onGoTo("reportes")} style={{ display:"inline-flex", alignItems:"center", gap:4, color:"#2563EB", fontSize:16, fontWeight:800, cursor:"pointer" }}>
                  Ver reportes <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color:"#9CA3AF", fontSize:14, padding:"4px 0" }}>Aún no hay evidencias registradas.</div>
          )}
        </div>

        <div style={{ height:8 }} />
      </div>
    </div>
  );
}
