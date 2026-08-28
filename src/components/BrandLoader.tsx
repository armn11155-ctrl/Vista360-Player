import { createPortal } from "react-dom";

interface Props {
  label?: string;
  /** Se conserva por compatibilidad con las llamadas existentes. Todas
   *  las variantes usan ahora la misma cortina azul. */
  dark?: boolean;
  /** Permite revelar la pantalla ya pintada sin cortar la cortina de golpe. */
  leaving?: boolean;
}

export default function BrandLoader({ label = "Cargando", dark = false, leaving = false }: Props) {
  return createPortal(
    <div className={`brand-loader${dark ? " brand-loader-dark" : ""}${leaving ? " brand-loader-leaving" : ""}`} role="status" aria-label={label}>
      <span className="brand-loader-sweep" aria-hidden="true" />
    </div>,
    document.body
  );
}
