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
  return <img src={src} alt={alt} className={className} style={style} />;
}
