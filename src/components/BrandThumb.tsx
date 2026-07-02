import { brandColor } from "../utils/brandColor";
import { PersonIcon } from "./PersonIcon";

interface Props {
  name: string;
  size?: number;
  radius?: number;
  /** Tamaño del ícono de persona respecto al thumbnail (0–1). Por defecto 0.58. */
  iconScale?: number;
}

/**
 * Thumbnail de marca: fondo de color único por empresa (siempre distinto
 * según el nombre) + un ícono genérico de persona en blanco encima —
 * igual criterio en todas las apps de Vista360 (ERP y Player).
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
      <PersonIcon size={iconSize} />
    </div>
  );
}
