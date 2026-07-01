export type Tab = "inicio" | "campanas" | "evidencias" | "reportes" | "perfil";

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
  isAdmin?: boolean;
  onCambiarCliente?: () => void;
}

const TABS: { id: Tab; label: string; icon: (active: boolean) => React.ReactNode }[] = [
  {
    id: "inicio", label: "Inicio",
    icon: (a) => a
      ? <svg width="24" height="24" viewBox="0 0 24 24" fill="#2563EB" stroke="#2563EB" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22" fill="white" stroke="white" strokeWidth="1.5"/></svg>
      : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  },
  {
    id: "campanas", label: "Campañas",
    icon: (a) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={a ? "#2563EB" : "#9CA3AF"} strokeWidth="1.8">
      <rect x="5" y="2" width="14" height="20" rx="2"/>
      <line x1="9" y1="8" x2="15" y2="8"/>
      <line x1="9" y1="12" x2="15" y2="12"/>
      <line x1="9" y1="16" x2="13" y2="16"/>
      <path d="M15 2v4H5"/>
    </svg>,
  },
  {
    id: "evidencias", label: "Evidencias",
    icon: (a) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={a ? "#2563EB" : "#9CA3AF"} strokeWidth="1.8">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>,
  },
  {
    id: "reportes", label: "Reportes",
    icon: (a) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={a ? "#2563EB" : "#9CA3AF"} strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>,
  },
  {
    id: "perfil", label: "Perfil",
    icon: (a) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={a ? "#2563EB" : "#9CA3AF"} strokeWidth="1.8">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>,
  },
];

export default function BottomNav({ active, onChange }: Props) {
  return (
    <div style={{
      background: "#fff",
      borderTop: "1px solid #EBEBEB",
      padding: `8px 0 calc(env(safe-area-inset-bottom) + 4px)`,
      display: "flex",
      justifyContent: "space-around",
      alignItems: "flex-end",
      flexShrink: 0,
      position: "sticky",
      bottom: 0,
      zIndex: 100,
    }}>
      {TABS.map((tab) => {
        const a = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              padding: "4px 4px 2px",
              background: "none",
              border: "none",
              cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
              position: "relative",
            }}
          >
            {tab.icon(a)}
            <span style={{
              fontSize: 10,
              fontWeight: a ? 700 : 500,
              color: a ? "#2563EB" : "#9CA3AF",
              letterSpacing: 0,
            }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
