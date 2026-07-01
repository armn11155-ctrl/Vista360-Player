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

// ─── Colores exactos del mockup ───────────────────────────────────────────────
const KPI = [
  {
    bgIcon: "#DBEAFE", // blue-100
    stroke: "#2563EB", // blue-600
    label: "Campañas activas",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
  },
  {
    bgIcon: "#DCFCE7", // green-100
    stroke: "#16A34A", // green-600
    label: "Pantallas activas",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <path d="M8 21h8M12 17v4"/>
      </svg>
    ),
  },
  {
    bgIcon: "#EDE9FE", // violet-100
    stroke: "#7C3AED", // violet-600
    label: "Última evidencia",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
    ),
  },
  {
    bgIcon: "#FFEDD5", // orange-100
    stroke: "#EA580C", // orange-600
    label: "Próximo vencimiento",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
      </svg>
    ),
  },
];

const QA = [
  {
    bgIcon: "#DBEAFE", stroke: "#2563EB", label: "Mis campañas", tab: "campanas" as const,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
  },
  {
    bgIcon: "#DCFCE7", stroke: "#16A34A", label: "Evidencias", tab: "evidencias" as const,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
    ),
  },
  {
    bgIcon: "#EDE9FE", stroke: "#7C3AED", label: "Reportes", tab: "reportes" as const,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
  },
  {
    bgIcon: "#FFEDD5", stroke: "#EA580C", label: "Nueva campaña", tab: "nueva" as const,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="16"/>
        <line x1="8" y1="12" x2="16" y2="12"/>
      </svg>
    ),
  },
];

export default function Inicio({ cliente, contratos, paneles, onGoTo, isAdmin, adminNombre }: Props) {
  const activas = contratos.filter((c) => estadoCampana(c) === "Activa");
  const pantallasActivas = new Set(activas.map((c) => c.panel_id)).size;
  const ultima = ultimaFoto(contratos);
  const proxVenc = proximoVencimiento(contratos);
  const todoOk = activas.length > 0 || contratos.length === 0;
  const nombre = isAdmin ? (adminNombre || "Admin") : (cliente?.empresa ?? "Cliente");

  const hora = new Date().getHours();
  const saludo = hora < 12 ? "Buenos días," : hora < 19 ? "Buenas tardes," : "Buenas noches,";

  const kpiValues = [
    String(activas.length),
    String(pantallasActivas),
    ultima ? ultima.foto.fecha : "—",
    proxVenc ? proxVenc.fin : "—",
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0D1629" }}>

      {/* ── HEADER ── */}
      <div style={{ padding: "16px 20px 52px", flexShrink: 0 }}>

        {/* Logo + campana */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", marginBottom: 22 }}>
          <img src="/logo-player.png" alt="Vista360 Player" style={{ height: 36 }} />
          <div style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)" }}>
            <div style={{ position: "relative", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {/* Badge rojo */}
              <div style={{ position: "absolute", top: 4, right: 4, width: 8, height: 8, background: "#EF4444", borderRadius: "50%", border: "1.5px solid #0D1629" }} />
            </div>
          </div>
        </div>

        {/* Saludo */}
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginBottom: 3 }}>{saludo}</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: "#FFFFFF", marginBottom: 14, letterSpacing: -0.3 }}>
          {isAdmin ? "Hola Admin" : nombre}
        </div>

        {/* Pill estado */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "rgba(255,255,255,0.1)",
          borderRadius: 20, padding: "7px 14px",
          border: "1px solid rgba(255,255,255,0.08)",
        }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: todoOk ? "#22C55E" : "#F59E0B", flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>
            {todoOk ? "Todo funcionando" : "Revisa tus campañas"}
          </span>
        </div>
      </div>

      {/* ── SECCIÓN BLANCA CON CURVA ── */}
      <div style={{
        flex: 1, overflowY: "auto",
        background: "#F2F4F8",
        borderRadius: "28px 28px 0 0",
        marginTop: -28,
        padding: "24px 16px 16px",
        WebkitOverflowScrolling: "touch" as any,
        overscrollBehavior: "contain",
      }}>

        {/* RESUMEN GENERAL */}
        <div style={{ background: "#fff", borderRadius: 20, padding: "18px 16px", marginBottom: 14, boxShadow: "0 1px 8px rgba(0,0,0,0.07)" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 14 }}>Resumen general</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {KPI.map((k, i) => (
              <div key={i} style={{
                background: "#fff", border: "1px solid #F0F2F5",
                borderRadius: 14, padding: "13px 12px",
                display: "flex", alignItems: "flex-start", gap: 11,
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 12,
                  background: k.bgIcon,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {k.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3, lineHeight: 1.3 }}>{k.label}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "#111827", lineHeight: 1.1 }}>{kpiValues[i]}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ACCESOS RÁPIDOS */}
        <div style={{ background: "#fff", borderRadius: 20, padding: "18px 16px", marginBottom: 14, boxShadow: "0 1px 8px rgba(0,0,0,0.07)" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 16 }}>Accesos rápidos</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {QA.map((q) => (
              <div key={q.tab} onClick={() => onGoTo(q.tab)} style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 7, cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 15,
                  background: q.bgIcon,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {q.icon}
                </div>
                <span style={{ fontSize: 11, color: "#374151", fontWeight: 500, textAlign: "center", lineHeight: 1.3 }}>
                  {q.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ÚLTIMA EVIDENCIA */}
        <div style={{ background: "#fff", borderRadius: 20, padding: "18px 16px", marginBottom: 16, boxShadow: "0 1px 8px rgba(0,0,0,0.07)" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 14 }}>Última evidencia recibida</div>
          {ultima ? (
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 120, height: 96, borderRadius: 12, overflow: "hidden", flexShrink: 0, background: "#F3F4F6" }}>
                <img src={ultima.foto.url} alt="Evidencia" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 8, lineHeight: 1.3 }}>
                  Pantalla: {paneles[ultima.panel ?? ""]?.nombre ?? ultima.panel}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#6B7280", fontSize: 12, marginBottom: 16 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  {ultima.foto.fecha}
                </div>
                <div onClick={() => onGoTo("evidencias")} style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  color: "#2563EB", fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}>
                  Ver evidencia
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: "#9CA3AF", fontSize: 13 }}>Aún no hay evidencias registradas.</div>
          )}
        </div>

        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}
