interface Props {
  label?: string;
  /** Se conserva por compatibilidad con las llamadas existentes. Todas
   *  las variantes usan ahora el mismo fondo blanco. */
  dark?: boolean;
}

export default function BrandLoader({ label = "Cargando", dark = false }: Props) {
  return (
    <div className={`brand-loader${dark ? " brand-loader-dark" : ""}`} role="status" aria-label={label}>
      <div className="brand-loader-mark">
        <img className="brand-loader-logo brand-loader-logo-base" src="/vista360-loader-v.png" alt="" draggable={false} />
        <span className="brand-loader-liquid" aria-hidden="true">
          <img className="brand-loader-logo brand-loader-logo-fill" src="/vista360-loader-v.png" alt="" draggable={false} />
        </span>
      </div>
    </div>
  );
}
