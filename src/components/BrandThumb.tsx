import { brandColor, brandInitials } from "../utils/brandColor";

interface Props {
  name: string;
  size?: number;
  radius?: number;
  fontSize?: number;
}

/**
 * Thumbnail de marca: fondo de color único por empresa + iniciales.
 * Ejemplo: "Coca-Cola Perú" → fondo rojo + "CO"
 */
export function BrandThumb({ name, size = 72, radius = 12, fontSize }: Props) {
  const { bg, text } = brandColor(name);
  const fs = fontSize ?? size * 0.28;
  const initials = brandInitials(name);

  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      background: bg, display: "flex", alignItems: "center", justifyContent: "center",
      color: text, fontWeight: 800, fontSize: fs, letterSpacing: 0.5,
      userSelect: "none",
    }}>
      {initials}
    </div>
  );
}
