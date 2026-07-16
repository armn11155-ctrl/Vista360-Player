interface Props {
  label?: string;
}

export default function BrandLoader({ label = "Cargando" }: Props) {
  return (
    <div className="brand-loader" role="status" aria-label={label}>
      <div className="brand-loader-mark">
        <img src="/vista360-loader-v.png" alt="" draggable={false} />
        <span className="brand-loader-shine" aria-hidden="true" />
      </div>
    </div>
  );
}
