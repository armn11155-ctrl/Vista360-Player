import type { CSSProperties } from "react";
import { useSignedUrls } from "../hooks/useSignedUrls";

interface Props {
  /** Key de R2, o URL vieja de Cloudinary (empieza con "http") por compatibilidad. */
  keyOUrl?: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
}

/** <img> que resuelve automáticamente una key de R2 a su URL firmada. */
export function SignedImg({ keyOUrl, alt = "", className, style }: Props) {
  const esUrlDirecta = Boolean(keyOUrl) && keyOUrl!.startsWith("http");
  const firmadas = useSignedUrls(esUrlDirecta ? [] : [keyOUrl]);
  const src = esUrlDirecta ? keyOUrl : keyOUrl ? firmadas[keyOUrl] : undefined;

  if (!src) return null;
  // loading="lazy": este componente muestra fotos de CONTENIDO (evidencias,
  // fotos de campaña, comprobantes), casi siempre en listas largas. Sin esto
  // el navegador descargaba todas las de la pantalla apenas se abría --
  // en una galería de evidencias eso son decenas de fotos de golpe, con
  // datos móviles. Ahora solo baja las que el usuario va a ver.
  // decoding="async" evita que decodificar la imagen congele el scroll.
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      loading="lazy"
      decoding="async"
    />
  );
}
