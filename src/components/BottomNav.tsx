import { PersonIcon } from "./PersonIcon";

export type Tab = "inicio" | "campanas" | "evidencias" | "reportes" | "perfil";

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
  isAdmin?: boolean;
  onCambiarCliente?: () => void;
}

const TABS: { id: Tab; label: string; getIcon: (a: boolean) => React.ReactNode }[] = [
  { id:"inicio", label:"Inicio", getIcon: a =>
    <svg width="22" height="22" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"
      fill={a ? "#2563EB" : "none"} stroke={a ? "#2563EB" : "#9CA3AF"} strokeWidth="1.8">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22" fill={a ? "white" : "none"} stroke={a ? "white" : "#9CA3AF"} strokeWidth="1.8"/>
    </svg>
  },
  { id:"campanas", label:"Campañas", getIcon: a =>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? "#2563EB" : "#9CA3AF"} strokeWidth="1.8" strokeLinecap="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  },
  { id:"evidencias", label:"Evidencias", getIcon: a =>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? "#2563EB" : "#9CA3AF"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  },
  { id:"reportes", label:"Reportes", getIcon: a =>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? "#2563EB" : "#9CA3AF"} strokeWidth="1.8" strokeLinecap="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  },
  { id:"perfil", label:"Perfil", getIcon: a =>
    <PersonIcon size={22} color={a ? "#2563EB" : "#9CA3AF"} />
  },
];

export default function BottomNav({ active, onChange }: Props) {
  return (
    <div className="bottom-nav" style={{
      background:"#fff",
      borderTop:"1px solid #EBEBEB",
      display:"flex",
      alignItems:"stretch",
      flexShrink:0,
      paddingBottom:"env(safe-area-inset-bottom)",
    }}>
      {TABS.map(tab => {
        const a = active === tab.id;
        return (
          <button key={tab.id} onClick={() => onChange(tab.id)} style={{
            flex:1, display:"flex", flexDirection:"column", alignItems:"center",
            justifyContent:"center", gap:3, padding:"9px 4px 8px",
            background:"none", border:"none", cursor:"pointer",
            WebkitTapHighlightColor:"transparent",
          }}>
            {tab.getIcon(a)}
            <span style={{ fontSize: 11, fontWeight: a ? 700 : 400, color: a ? "#2563EB" : "#9CA3AF", letterSpacing:0 }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
