import { PersonIcon } from "./PersonIcon";
import { reproducirSonidoInterfaz } from "../utils/sonidosInterfaz";

export type Tab = "inicio" | "campanas" | "cobertura" | "reportes" | "perfil";

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
  isAdmin?: boolean;
  onCambiarCliente?: () => void;
}

const TABS: { id: Tab; label: string; getIcon: (a: boolean) => React.ReactNode }[] = [
  { id:"inicio", label:"Inicio", getIcon: a =>
    <svg width="22" height="22" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"
      fill={a ? "#0877FF" : "none"} stroke={a ? "#0877FF" : "#64748B"} strokeWidth="1.8">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22" fill={a ? "white" : "none"} stroke={a ? "white" : "#64748B"} strokeWidth="1.8"/>
    </svg>
  },
  { id:"campanas", label:"Campañas", getIcon: a =>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? "#0877FF" : "#64748B"} strokeWidth="1.8" strokeLinecap="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  },
  { id:"cobertura", label:"Cobertura", getIcon: a =>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? "#0877FF" : "#64748B"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z"/>
      <path d="M9 3v15M15 6v15"/>
      <circle cx="15" cy="10" r="2"/>
    </svg>
  },
  { id:"reportes", label:"Reportes", getIcon: a =>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a ? "#0877FF" : "#64748B"} strokeWidth="1.8" strokeLinecap="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  },
  { id:"perfil", label:"Perfil", getIcon: a =>
    <PersonIcon size={22} color={a ? "#0877FF" : "#64748B"} />
  },
];

export default function BottomNav({ active, onChange }: Props) {
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {TABS.map(tab => {
        const a = active === tab.id;
        return (
          <button
            type="button"
            key={tab.id}
            className={`nav-item${a ? " active" : ""}`}
            onClick={() => {
              if (a) return;
              reproducirSonidoInterfaz("navegacion");
              onChange(tab.id);
            }}
            aria-current={a ? "page" : undefined}
          >
            <span className="nav-item-icon" aria-hidden="true">{tab.getIcon(a)}</span>
            <span className="nav-item-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
