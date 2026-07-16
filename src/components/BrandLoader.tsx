interface Props {
  label?: string;
}

export default function BrandLoader({ label = "Cargando" }: Props) {
  return (
    <div className="brand-loader" role="status" aria-label={label}>
      <div className="brand-loader-mark">
        <img className="brand-loader-logo brand-loader-logo-base" src="/vista360-loader-v.png" alt="" draggable={false} />
        <span className="brand-loader-liquid" aria-hidden="true">
          <img className="brand-loader-logo brand-loader-logo-fill" src="/vista360-loader-v.png" alt="" draggable={false} />
        </span>
      </div>
    </div>
  );
}
