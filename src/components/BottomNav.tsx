export type Tab = "inicio" | "campanas" | "evidencias" | "reportes" | "perfil";

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
}

const ITEMS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: "inicio",
    label: "Inicio",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    id: "campanas",
    label: "Campañas",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    ),
  },
  {
    id: "evidencias",
    label: "Evidencias",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    ),
  },
  {
    id: "reportes",
    label: "Reportes",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    id: "perfil",
    label: "Perfil",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

export default function BottomNav({ active, onChange }: Props) {
  return (
    <div className="bottom-nav">
      {ITEMS.map((item) => (
        <div
          key={item.id}
          className={`nav-item ${active === item.id ? "active" : ""}`}
          onClick={() => onChange(item.id)}
          style={{ color: active === item.id ? "#2563EB" : "#9CA3AF", stroke: active === item.id ? "#2563EB" : "#9CA3AF" }}
        >
          {item.icon}
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
