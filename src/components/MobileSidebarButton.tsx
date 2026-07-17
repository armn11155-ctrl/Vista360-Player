interface Props {
  onClick?: () => void;
}

export default function MobileSidebarButton({ onClick }: Props) {
  if (!onClick) return null;
  return (
    <button type="button" className="mobile-sidebar-header-btn" onClick={onClick} aria-label="Abrir menú">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>
  );
}
