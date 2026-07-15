import { brandColor } from "../utils/brandColor";
import { ClientCharacter } from "./ClientCharacter";

interface Props {
  name: string;
  size?: number;
  radius?: number;
  /** Tamaño del ícono de persona respecto al thumbnail (0–1). Por defecto 0.58. */
  iconScale?: number;
}

/**
 * Thumbnail de marca: fondo de color único por empresa + personaje estable
 * por nombre. Así cada cliente se reconoce sin depender solo del color.
 */
export function BrandThumb({ name, size = 72, radius = 12, iconScale = 0.58 }: Props) {
  const { bg } = brandColor(name);
  const iconSize = size * iconScale;

  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      background: bg, display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", userSelect: "none",
    }}>
      <ClientCharacter name={name} size={iconSize} />
    </div>
  );
}
