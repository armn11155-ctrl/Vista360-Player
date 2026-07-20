import { useEffect, useState } from "react";
import { brandColor } from "../utils/brandColor";
import { ClientAvatar } from "./ClientAvatar";
import { useSignedUrls } from "../hooks/useSignedUrls";

interface Props {
  name: string;
  avatarKey?: string;
  /** Puede ser una key de R2 (nueva) o, por compatibilidad con datos
   *  viejos, una URL completa de Cloudinary (empieza con "http"). */
  avatarUrl?: string;
  size?: number;
  radius?: number;
  /** Tamaño del ícono de persona respecto al thumbnail (0–1). Por defecto 0.58. */
  iconScale?: number;
}

/**
 * Thumbnail de marca: fondo de color único por empresa + personaje estable
 * por nombre. Así cada cliente se reconoce sin depender solo del color.
 */
export function BrandThumb({ name, avatarKey, avatarUrl, size = 72, radius = 12, iconScale = 0.58 }: Props) {
  const { bg } = brandColor(name);
  const iconSize = size * iconScale;
  const esKeyR2 = Boolean(avatarUrl) && !avatarUrl!.startsWith("http");
  const firmadas = useSignedUrls(esKeyR2 ? [avatarUrl] : []);
  const src = esKeyR2 ? firmadas[avatarUrl!] : avatarUrl;
  // Si la foto real ya no existe en la nube (o el link vencio y algo
  // fallo al re-firmar), el navegador la marca como rota ("Load
  // failed" en Safari). En vez de mostrar eso, volvemos al icono por
  // defecto.
  const [fallo, setFallo] = useState(false);
  useEffect(() => setFallo(false), [src]);
  const mostrarFoto = Boolean(src) && !fallo;

  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      background: bg, display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", userSelect: "none",
    }}>
      {mostrarFoto ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onError={() => setFallo(true)}
        />
      ) : (
        <ClientAvatar name={name} avatarKey={avatarKey} size={iconSize} />
      )}
    </div>
  );
}
