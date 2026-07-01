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
  for (const c of contratos) {
    for (const f of c.fotos_campania ?? []) {
      if (!best || f.fecha > best.foto.fecha) best = { foto: f, panel: c.panel_id };
    }
  }
  return best;
}

function proximoVencimiento(contratos: Contrato[]): Contrato | null {
  const activos = contratos
    .filter((c) => estadoCampana(c) !== "Finalizada")
    .sort((a, b) => a.fin.localeCompare(b.fin));
  return activos[0] ?? null;
}

export default function Inicio({ cliente, contratos, paneles, onGoTo, isAdmin, adminNombre }: Props) {
  const activas = contratos.filter((c) => estadoCampana(c) === "Activa");
  const pantallasActivas = new Set(activas.map((c) => c.panel_id)).size;
  const ultima = ultimaFoto(contratos);
  const proxVenc = proximoVencimiento(contratos);
  const todoOk = activas.length > 0 || contratos.length === 0;
  const nombre = isAdmin ? (adminNombre || "Admin") : (cliente?.empresa ?? "Cliente");

  const hora = new Date().getHours();
  const saludo = hora < 12 ? "Buenos días," : hora < 19 ? "Buenas tardes," : "Buenas noches,";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0D1629" }}>

      {/* ── HEADER ── */}
      <div style={{ padding: "16px 20px 48px", flexShrink: 0 }}>

        {/* Fila logo + campana */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", marginBottom: 20 }}>
          {/* Logo centrado */}
          <img
            src="/logo-player.png"
            alt="Vista360 Player"
            style={{ height: 38, display: "block" }}
          />
          {/* Campana top-right */}
          <div style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", cursor: "pointer", position: "absolute", right: 0 }}>
            <div style={{ position: "relative", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <div style={{
                position: "absolute", top: 2, right: 2,
                width: 9, height: 9, background: "#EF4444",
                borderRadius: "50%", border: "1.5px solid #0D1629",
              }} />
            </div>
          </div>
        </div>

        {/* Saludo */}
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", marginBottom: 4 }}>{saludo}</div>
        <div style={{ fontSize: 30, fontWeight: 800, color: "#fff", marginBottom: 14, letterSpacing: -0.5 }}>
          {isAdmin ? "Hola Admin" : nombre}
        </div>

        {/* Status pill */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)",
          borderRadius: 20, padding: "7px 14px",
        }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: todoOk ? "#22C55E" : "#F59E0B", flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>
            {todoOk ? "Todo funcionando" : "Revisa tus campañas"}
          </span>
        </div>
      </div>

      {/* ── CONTENIDO BLANCO CON CURVA ── */}
      <div style={{
        flex: 1, overflowY: "auto", overscrollBehavior: "contain",
        background: "#F2F4F8", borderRadius: "28px 28px 0 0",
        marginTop: -28, padding: "24px 16px 16px",
        WebkitOverflowScrolling: "touch",
      }}>

        {/* RESUMEN GENERAL */}
        <div style={{ background: "#fff", borderRadius: 20, padding: 18, marginBottom: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#111827", marginBottom: 16 }}>Resumen general</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              {
                bg: "#EFF6FF", icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                ), label: "Campañas activas", value: String(activas.length),
              },
              {
                bg: "#F0FDF4", icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                  </svg>
                ), label: "Pantallas activas", value: String(pantallasActivas),
              },
              {
                bg: "#F5F3FF", icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                ), label: "Última evidencia", value: ultima ? ultima.foto.fecha : "—",
              },
              {
                bg: "#FFF7ED", icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>
                    <line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/>
                  </svg>
                ), label: "Próximo vencimiento", value: proxVenc ? proxVenc.fin : "—",
              },
            ].map((kpi, i) => (
              <div key={i} style={{ background: "#fff", border: "1px solid #F0F0F0", borderRadius: 14, padding: "14px 12px", display: "flex", alignItems: "flex-start", gap: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: kpi.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {kpi.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{kpi.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#111827", lineHeight: 1.1 }}>{kpi.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ACCESOS RÁPIDOS */}
        <div style={{ background: "#fff", borderRadius: 20, padding: 18, marginBottom: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#111827", marginBottom: 16 }}>Accesos rápidos</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            {[
              { bg: "#EFF6FF", stroke: "#3B82F6", label: "Mis campañas", tab: "campanas" as const,
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> },
              { bg: "#F0FDF4", stroke: "#22C55E", label: "Evidencias", tab: "evidencias" as const,
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> },
              { bg: "#F5F3FF", stroke: "#8B5CF6", label: "Reportes", tab: "reportes" as const,
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
              { bg: "#FFF7ED", stroke: "#F97316", label: "Nueva campaña", tab: "nueva" as const,
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> },
            ].map((qa) => (
              <div key={qa.tab} onClick={() => onGoTo(qa.tab)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <div style={{ width: 58, height: 58, borderRadius: 16, background: qa.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {qa.icon}
                </div>
                <span style={{ fontSize: 11, color: "#374151", fontWeight: 500, textAlign: "center", lineHeight: 1.3 }}>{qa.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ÚLTIMA EVIDENCIA */}
        <div style={{ background: "#fff", borderRadius: 20, padding: 18, marginBottom: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#111827", marginBottom: 14 }}>Última evidencia recibida</div>
          {ultima ? (
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 120, height: 100, borderRadius: 12, overflow: "hidden", flexShrink: 0, background: "#F3F4F6" }}>
                <img src={ultima.foto.url} alt="Evidencia" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 8 }}>
                  Pantalla: {paneles[ultima.panel ?? ""]?.nombre ?? ultima.panel}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#6B7280", fontSize: 12, marginBottom: 14 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  {ultima.foto.fecha}
                </div>
                <div
                  onClick={() => onGoTo("evidencias")}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#2563EB", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                >
                  Ver evidencia
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: "#9CA3AF", fontSize: 13, padding: "8px 0" }}>Aún no hay evidencias registradas.</div>
          )}
        </div>

        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}
