/**
 * Genera un color premium consistente a partir del nombre de la empresa.
 * Tiene colores vivos, pero controlados con base oscura para que combinen
 * con Vista360 en vez de verse como bloques planos aleatorios.
 */
const PALETTE = [
  { bg: "linear-gradient(145deg, #0B1728 0%, #1D4ED8 100%)", text: "#fff" },
  { bg: "linear-gradient(145deg, #10213A 0%, #7C3AED 100%)", text: "#fff" },
  { bg: "linear-gradient(145deg, #0E2B2F 0%, #22C55E 100%)", text: "#fff" },
  { bg: "linear-gradient(145deg, #1E1A12 0%, #F59E0B 100%)", text: "#fff" },
  { bg: "linear-gradient(145deg, #10213A 0%, #38BDF8 100%)", text: "#fff" },
  { bg: "linear-gradient(145deg, #1B1028 0%, #DB2777 100%)", text: "#fff" },
  { bg: "linear-gradient(145deg, #0D1629 0%, #2563EB 100%)", text: "#fff" },
  { bg: "linear-gradient(145deg, #111827 0%, #475569 100%)", text: "#fff" },
];

export function brandColor(name: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function brandInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
