export const CLIENT_AVATAR_OPTIONS = [
  { key: "tower", label: "Torre" },
  { key: "store", label: "Local" },
  { key: "factory", label: "Industria" },
  { key: "mall", label: "Centro" },
  { key: "office", label: "Oficina" },
  { key: "media", label: "Media" },
] as const;

export type ClientAvatarKey = typeof CLIENT_AVATAR_OPTIONS[number]["key"];

interface Props {
  name: string;
  avatarKey?: string;
  size?: number;
}

const WINDOWS = ["#FFFFFF", "#EAF3FF", "#D7E9FF", "#BFDBFE", "#EEF4FF", "#F8FAFC"];
const ACCENTS = ["#0877FF", "#0B3F8A", "#111B2D", "#2F8DFF", "#0B1220", "#66A9FF"];

function hashName(name: string) {
  let hash = 0;
  for (const char of name || "?") hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

function avatarForName(name: string): ClientAvatarKey {
  return CLIENT_AVATAR_OPTIONS[hashName(name) % CLIENT_AVATAR_OPTIONS.length].key;
}

function normalizeAvatarKey(key: string | undefined, name: string): ClientAvatarKey {
  return CLIENT_AVATAR_OPTIONS.some((option) => option.key === key)
    ? (key as ClientAvatarKey)
    : avatarForName(name);
}

export function ClientAvatar({ name, avatarKey, size = 44 }: Props) {
  const hash = hashName(name);
  const key = normalizeAvatarKey(avatarKey, name);
  const windowColor = WINDOWS[hash % WINDOWS.length];
  const accent = ACCENTS[(hash >> 3) % ACCENTS.length];
  const dark = "#0F172A";

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="rgba(255,255,255,.16)" />
      <circle cx="50" cy="50" r="38" fill="rgba(2,6,23,.18)" />

      {key === "tower" && (
        <>
          <path d="M30 88V20c0-4 3-7 7-7h26c4 0 7 3 7 7v68H30z" fill={dark} />
          <path d="M36 23h28v65H36V23z" fill="#0B3F8A" />
          {[30, 42, 54, 66].map((y) => (
            <g key={y}>
              <rect x="41" y={y} width="7" height="7" rx="1.5" fill={windowColor} />
              <rect x="53" y={y} width="7" height="7" rx="1.5" fill={windowColor} opacity=".82" />
            </g>
          ))}
          <path d="M44 88V77h12v11H44z" fill={accent} />
        </>
      )}

      {key === "store" && (
        <>
          <path d="M22 45h56v40H22V45z" fill={dark} />
          <path d="M27 49h46v36H27V49z" fill="#0B3F8A" />
          <path d="M20 38h60l-7-16H27l-7 16z" fill={accent} />
          <path d="M24 38h8v9a4 4 0 0 1-8 0v-9zm16 0h8v9a4 4 0 0 1-8 0v-9zm16 0h8v9a4 4 0 0 1-8 0v-9zm16 0h8v9a4 4 0 0 1-8 0v-9z" fill="#F8FAFC" />
          <rect x="36" y="58" width="12" height="27" rx="2" fill="#0F172A" />
          <rect x="54" y="58" width="13" height="12" rx="2" fill={windowColor} />
        </>
      )}

      {key === "factory" && (
        <>
          <path d="M19 88V53l19 10V53l19 10V43h24v45H19z" fill={dark} />
          <path d="M25 84V62l17 9V62l17 9V49h16v35H25z" fill="#334155" />
          <path d="M63 31h14v16H63z" fill={accent} />
          <rect x="31" y="72" width="9" height="8" rx="1" fill={windowColor} />
          <rect x="48" y="72" width="9" height="8" rx="1" fill={windowColor} />
          <rect x="65" y="72" width="9" height="8" rx="1" fill={windowColor} />
        </>
      )}

      {key === "mall" && (
        <>
          <path d="M19 88h62V36H19v52z" fill={dark} />
          <path d="M25 84h50V42H25v42z" fill="#312E81" />
          <path d="M18 36l32-18 32 18H18z" fill={accent} />
          <path d="M34 84V60h32v24H34z" fill="#0F172A" />
          <path d="M39 60h22v24H39V60z" fill={windowColor} opacity=".86" />
          <rect x="31" y="47" width="10" height="8" rx="1.5" fill={windowColor} />
          <rect x="59" y="47" width="10" height="8" rx="1.5" fill={windowColor} />
        </>
      )}

      {key === "office" && (
        <>
          <path d="M24 88V28h22v60H24z" fill="#1E293B" />
          <path d="M46 88V16h30v72H46z" fill={dark} />
          <path d="M29 34h12M29 45h12M29 56h12M29 67h12" stroke={windowColor} strokeWidth="5" strokeLinecap="round" />
          <path d="M53 26h16M53 38h16M53 50h16M53 62h16" stroke={windowColor} strokeWidth="5" strokeLinecap="round" />
          <path d="M54 88V76h14v12H54z" fill={accent} />
        </>
      )}

      {key === "media" && (
        <>
          <rect x="19" y="27" width="62" height="43" rx="7" fill={dark} />
          <rect x="25" y="33" width="50" height="31" rx="4" fill="#075985" />
          <path d="M45 42l16 8-16 8V42z" fill={windowColor} />
          <path d="M36 88h28M50 70v18" stroke={accent} strokeWidth="8" strokeLinecap="round" />
          <path d="M28 23h44" stroke="#F8FAFC" strokeWidth="4" strokeLinecap="round" opacity=".74" />
        </>
      )}
    </svg>
  );
}
