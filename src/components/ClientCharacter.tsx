interface Props {
  name: string;
  size?: number;
}

const SKIN = ["#F7C8A4", "#DFA071", "#B97856", "#F1B98B", "#8F5F43", "#E5AC7E"];
const SHIRT = ["#60A5FA", "#34D399", "#F472B6", "#FBBF24", "#A78BFA", "#22D3EE", "#FB7185", "#4ADE80"];
const HAIR = ["#1F2937", "#3B2416", "#6B3F24", "#0F172A", "#7C2D12", "#111827"];
const ACCESSORY = ["glasses", "cap", "headset", "beanie", "badge", "tie", "waves", "none"] as const;

function hashName(name: string) {
  let hash = 0;
  for (const char of name || "?") {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function pick<T>(items: readonly T[], hash: number, salt: number) {
  return items[Math.abs(hash + salt) % items.length];
}

/**
 * Personaje estable por cliente. La misma empresa siempre obtiene el mismo
 * rostro/accesorio, para que el admin identifique perfiles de un vistazo.
 */
export function ClientCharacter({ name, size = 44 }: Props) {
  const hash = hashName(name);
  const skin = pick(SKIN, hash, 3);
  const shirt = pick(SHIRT, hash, 11);
  const hair = pick(HAIR, hash, 19);
  const accessory = pick(ACCESSORY, hash, 29);
  const smile = hash % 3;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="rgba(255,255,255,.16)" />
      <path d="M19 92c3.8-19 16.2-31 31-31s27.2 12 31 31H19z" fill={shirt} />
      <path d="M28 91c5.3-13.6 13-20.4 22-20.4S66.7 77.4 72 91H28z" fill="rgba(255,255,255,.18)" />
      {accessory === "tie" && <path d="M46 66h8l3 25-7 7-7-7 3-25z" fill="#0F172A" opacity=".86" />}
      <circle cx="50" cy="43" r="24" fill={skin} />
      <path d="M27 42c1.4-15.8 10.7-26.2 24.5-26.2 12.2 0 21.2 7.7 22.7 19.2-9.2-2.5-17.2-6.8-23.8-12.8C43.8 31.4 36 38 27 42z" fill={hair} />
      <path d="M30 43c2.4-6.4 6.8-12.2 13.2-17.3 7.5 6.6 16.2 10.6 26.1 12-1.4-11.8-8.7-20-20-20C37 17.7 28.8 27.8 30 43z" fill="rgba(255,255,255,.12)" />
      <circle cx="40" cy="46" r="2.5" fill="#0F172A" />
      <circle cx="60" cy="46" r="2.5" fill="#0F172A" />
      {smile === 0 && <path d="M42 56c4.6 4.2 11.4 4.2 16 0" stroke="#7C2D12" strokeWidth="3" strokeLinecap="round" />}
      {smile === 1 && <path d="M43 57h14" stroke="#7C2D12" strokeWidth="3" strokeLinecap="round" />}
      {smile === 2 && <path d="M41 55c5.2 5.8 12.6 6.3 18 1" stroke="#7C2D12" strokeWidth="3" strokeLinecap="round" />}
      {accessory === "glasses" && (
        <g stroke="#E5E7EB" strokeWidth="3" strokeLinecap="round">
          <circle cx="39" cy="46" r="7" />
          <circle cx="61" cy="46" r="7" />
          <path d="M46 46h8" />
        </g>
      )}
      {accessory === "cap" && (
        <g>
          <path d="M29 32c5-11 14-16 27-14 8 1.2 14 5.6 18 13-12.7-.4-27.7-.1-45 1z" fill="#2563EB" />
          <path d="M55 30c9.8 0 17 1.9 21.5 5.8-6.2.9-12.5.7-18.8-.8L55 30z" fill="#93C5FD" />
        </g>
      )}
      {accessory === "headset" && (
        <g stroke="#E5E7EB" strokeWidth="4" strokeLinecap="round">
          <path d="M29 45v-5c0-12 8.4-21 21-21s21 9 21 21v5" />
          <path d="M28 45v10M72 45v10M69 60c-4 4-8.8 6-14.5 6" />
        </g>
      )}
      {accessory === "beanie" && (
        <g>
          <path d="M29 34c1.8-13 9.7-20 21-20s19.2 7 21 20H29z" fill="#7C3AED" />
          <path d="M28 34h44v8H28z" fill="#C4B5FD" />
        </g>
      )}
      {accessory === "badge" && <circle cx="66" cy="66" r="7" fill="#FDE68A" stroke="#92400E" strokeWidth="2" />}
      {accessory === "waves" && (
        <g stroke="#DBEAFE" strokeWidth="3" strokeLinecap="round">
          <path d="M30 28c5-4 10-4 15 0s10 4 15 0 9-4 13-.5" />
          <path d="M31 34c4-3 8-3 12 0s8 3 12 0 8-3 12 0" opacity=".75" />
        </g>
      )}
    </svg>
  );
}
