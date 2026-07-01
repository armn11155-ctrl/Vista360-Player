import type { Cliente, Contrato, FotoCampania, Panel } from "../../types";
import { estadoCampana } from "../../types";

interface Props {
  cliente: Cliente | null;
  contratos: Contrato[];
  paneles: Record<string, Panel>;
  onGoTo: (tab: "campanas" | "evidencias" | "reportes" | "nueva") => void;
  onMenuClick?: () => void;
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

const HEADER = "#0D1B2E";

export default function Inicio({ cliente, contratos, paneles, onGoTo, isAdmin, adminNombre }: Props) {
  const activas = contratos.filter(c => estadoCampana(c) === "Activa");
  const pantallasActivas = new Set(activas.map(c => c.panel_id)).size;
  const ultima = ultimaFoto(contratos);
  const proxVenc = proximoVencimiento(contratos);
  const todoOk = activas.length > 0 || contratos.length === 0;
  const nombre = isAdmin ? (adminNombre || "Admin") : (cliente?.empresa ?? "Cliente");
  const hora = new Date().getHours();
  const saludo = hora < 12 ? "Buenos días," : hora < 19 ? "Buenas tardes," : "Buenas noches,";

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background: HEADER }}>

      {/* ── HEADER ── */}
      <div style={{ padding:"12px 18px 44px", flexShrink:0 }}>
        {/* Logo + campana */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", position:"relative", marginBottom:16 }}>
          <img src="/logo-player.png" alt="Vista360 Player" style={{ height:32 }} />
          <div style={{ position:"absolute", right:0, display:"flex", alignItems:"center" }}>
            <div style={{ position:"relative", width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              <div style={{ position:"absolute", top:3, right:3, width:7, height:7, background:"#EF4444", borderRadius:"50%", border:`1.5px solid ${HEADER}` }} />
            </div>
          </div>
        </div>
        {/* Saludo */}
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.55)", marginBottom:2 }}>{saludo}</div>
        <div style={{ fontSize:24, fontWeight:800, color:"#fff", marginBottom:10, letterSpacing:-0.3 }}>
          {isAdmin ? "Hola Admin" : nombre}
        </div>
        {/* Pill */}
        <div style={{ display:"inline-flex", alignItems:"center", gap:6, background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:20, padding:"5px 12px" }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background:"#22C55E" }} />
          <span style={{ fontSize:12, color:"#fff", fontWeight:500 }}>{todoOk ? "Todo funcionando" : "Revisa tus campañas"}</span>
        </div>
      </div>

      {/* ── FONDO BLANCO CON CURVA ── */}
      <div style={{ flex:1, overflowY:"auto", background:"#F2F4F8", borderRadius:"24px 24px 0 0", marginTop:-24, padding:"18px 14px 10px", WebkitOverflowScrolling:"touch" as any, overscrollBehavior:"contain" }}>

        {/* RESUMEN GENERAL — título suelto, cards individuales */}
        <div style={{ fontSize:15, fontWeight:700, color:"#111827", marginBottom:10 }}>Resumen general</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
          {[
            { bg:"#DBEAFE", label:"Campañas activas", val:String(activas.length),
              icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
            { bg:"#DCFCE7", label:"Pantallas activas", val:String(pantallasActivas),
              icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> },
            { bg:"#EDE9FE", label:"Última evidencia", val:ultima ? ultima.foto.fecha : "—",
              icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.2" strokeLinecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> },
            { bg:"#FFEDD5", label:"Próximo vencimiento", val:proxVenc ? proxVenc.fin : "—",
              icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg> },
          ].map((k,i) => (
            <div key={i} style={{ background:"#fff", border:"1px solid #EEF0F3", borderRadius:12, padding:"11px 10px", display:"flex", alignItems:"center", gap:9, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ width:34, height:34, borderRadius:9, background:k.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                {k.icon}
              </div>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:10, color:"#6B7280", marginBottom:1, lineHeight:1.2 }}>{k.label}</div>
                <div style={{ fontSize:15, fontWeight:800, color:"#111827", lineHeight:1.1 }}>{k.val}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ACCESOS RÁPIDOS — título suelto, íconos directos sin card exterior */}
        <div style={{ fontSize:15, fontWeight:700, color:"#111827", marginBottom:12 }}>Accesos rápidos</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, marginBottom:16 }}>
          {[
            { bg:"#DBEAFE", label:"Mis campañas", tab:"campanas" as const,
              icon:<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
            { bg:"#DCFCE7", label:"Evidencias", tab:"evidencias" as const,
              icon:<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> },
            { bg:"#EDE9FE", label:"Reportes", tab:"reportes" as const,
              icon:<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
            { bg:"#FFEDD5", label:"Nueva campaña", tab:"nueva" as const,
              icon:<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> },
          ].map(q => (
            <div key={q.tab} onClick={() => onGoTo(q.tab)} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5, cursor:"pointer", WebkitTapHighlightColor:"transparent" }}>
              <div style={{ width:52, height:52, borderRadius:14, background:q.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
                {q.icon}
              </div>
              <span style={{ fontSize:10, color:"#374151", fontWeight:500, textAlign:"center", lineHeight:1.3 }}>{q.label}</span>
            </div>
          ))}
        </div>

        {/* ÚLTIMA EVIDENCIA — sí es una card (igual al mockup) */}
        <div style={{ fontSize:15, fontWeight:700, color:"#111827", marginBottom:10 }}>Última evidencia recibida</div>
        <div style={{ background:"#fff", borderRadius:14, padding:"12px", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
          {ultima ? (
            <div style={{ display:"flex", gap:11, alignItems:"flex-start" }}>
              <div style={{ width:100, height:80, borderRadius:10, overflow:"hidden", flexShrink:0, background:"#F3F4F6" }}>
                <img src={ultima.foto.url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              </div>
              <div style={{ flex:1, paddingTop:2 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#111827", marginBottom:6, lineHeight:1.3 }}>
                  Pantalla: {paneles[ultima.panel ?? ""]?.nombre ?? ultima.panel}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:4, color:"#6B7280", fontSize:11, marginBottom:12 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  {ultima.foto.fecha}
                </div>
                <div onClick={() => onGoTo("evidencias")} style={{ display:"inline-flex", alignItems:"center", gap:2, color:"#2563EB", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                  Ver evidencia <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color:"#9CA3AF", fontSize:12, padding:"8px 0" }}>Aún no hay evidencias registradas.</div>
          )}
        </div>

        <div style={{ height:8 }} />
      </div>
    </div>
  );
}
