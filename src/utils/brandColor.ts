/**
 * Genera un color premium consistente a partir del nombre de la empresa.
 * Mantiene variedad sin salir de la identidad Vista360: navy, azul,
 * cyan, verde tech y slate. Evita colores sueltos que rompen la marca.
 */
const PALETTE = [
  { bg: "linear-gradient(145deg, #0B1728 0%, #1D4ED8 100%)", text: "#fff" },
  { bg: "linear-gradient(145deg, #0D1629 0%, #2563EB 100%)", text: "#fff" },
  { bg: "linear-gradient(145deg, #0F2742 0%, #0891B2 100%)", text: "#fff" },
  { bg: "linear-gradient(145deg, #0E2B2F 0%, #16A34A 100%)", text: "#fff" },
  { bg: "linear-gradient(145deg, #111827 0%, #475569 100%)", text: "#fff" },
  { bg: "linear-gradient(145deg, #10213A 0%, #38BDF8 100%)", text: "#fff" },
  { bg: "linear-gradient(145deg, #08111F 0%, #1E40AF 100%)", text: "#fff" },
  { bg: "linear-gradient(145deg, #0F1D32 0%, #0EA5E9 100%)", text: "#fff" },
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
