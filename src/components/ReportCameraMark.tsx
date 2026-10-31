/** A photographic report needs a camera, not an analytics chart. */
export function ReportCameraMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 88" fill="none" aria-hidden="true">
      <rect x="14" y="20" width="92" height="60" rx="8" stroke="currentColor" strokeWidth="2" />
      <path d="M31 20 38 9h28l7 11" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="60" cy="50" r="18" stroke="currentColor" strokeWidth="2" />
      <circle cx="60" cy="50" r="11" stroke="currentColor" strokeOpacity=".65" strokeWidth="2" />
      <circle cx="88" cy="34" r="3" fill="currentColor" />
      <path d="M24 71h22M74 71h22" stroke="currentColor" strokeOpacity=".5" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
