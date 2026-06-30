/**
 * Genera un color de fondo consistente a partir del nombre de la empresa.
 * El mismo nombre siempre produce el mismo color — como un avatar de marca.
 */
const PALETTE = [
  { bg: "#CC0000", text: "#fff" }, // Rojo (Coca-Cola style)
  { bg: "#1558D6", text: "#fff" }, // Azul
  { bg: "#059669", text: "#fff" }, // Verde
  { bg: "#7C3AED", text: "#fff" }, // Violeta
  { bg: "#D97706", text: "#fff" }, // Naranja
  { bg: "#DB2777", text: "#fff" }, // Rosa
  { bg: "#0891B2", text: "#fff" }, // Cyan
  { bg: "#65A30D", text: "#fff" }, // Lima
  { bg: "#DC2626", text: "#fff" }, // Rojo vivo
  { bg: "#4F46E5", text: "#fff" }, // Índigo
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
