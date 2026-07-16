/**
 * Genera una marca visual consistente a partir del nombre de la empresa.
 * Mantiene la paleta Vista360: negro premium, azul noche, azul eléctrico
 * y blanco, sin colores aleatorios que rompan la identidad.
 */
const PALETTE = [
  { bg: "linear-gradient(145deg, #050A12 0%, #0877FF 100%)", text: "#fff" },
  { bg: "linear-gradient(145deg, #0B1220 0%, #0B3F8A 100%)", text: "#fff" },
  { bg: "linear-gradient(145deg, #111B2D 0%, #0877FF 100%)", text: "#fff" },
  { bg: "linear-gradient(145deg, #050A12 0%, #111B2D 58%, #0877FF 100%)", text: "#fff" },
  { bg: "linear-gradient(145deg, #0B1220 0%, #FFFFFF 180%)", text: "#fff" },
  { bg: "linear-gradient(145deg, #050A12 0%, #0B1220 48%, #0B3F8A 100%)", text: "#fff" },
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
