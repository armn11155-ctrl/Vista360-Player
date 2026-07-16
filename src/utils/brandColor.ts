/**
 * Genera una marca visual consistente a partir del nombre de la empresa.
 * Mantiene la paleta Vista360: negro premium, azul noche, azul eléctrico
 * y blanco, sin colores aleatorios que rompan la identidad.
 */
const PALETTE = [
  { bg: "#050A12", text: "#fff" },
  { bg: "#0B1220", text: "#fff" },
  { bg: "#111B2D", text: "#fff" },
  { bg: "#0B3F8A", text: "#fff" },
  { bg: "#0877FF", text: "#fff" },
  { bg: "#1E293B", text: "#fff" },
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
