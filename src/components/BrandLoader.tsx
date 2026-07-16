interface Props {
  label?: string;
}

export default function BrandLoader({ label = "Cargando" }: Props) {
  return (
    <div className="brand-loader" role="status" aria-label={label}>
      <div className="brand-loader-mark">
        <svg className="brand-loader-symbol" viewBox="0 0 120 120" aria-hidden="true">
          <defs>
            <clipPath id="brand-loader-liquid-clip">
              <rect className="brand-loader-liquid-level" x="0" y="0" width="120" height="120" />
            </clipPath>
          </defs>
          <circle className="brand-loader-ring" cx="60" cy="60" r="51" />
          <path className="brand-loader-v-base" d="M31 37 56 84c1.7 3.2 6.3 3.2 8 0l25-47H76L60 70 44 37H31Z" />
          <g clipPath="url(#brand-loader-liquid-clip)">
            <path className="brand-loader-v-fill" d="M31 37 56 84c1.7 3.2 6.3 3.2 8 0l25-47H76L60 70 44 37H31Z" />
            <path className="brand-loader-wave" d="M20 61c10-5 20 5 30 0s20-5 30 0 20 5 30 0" />
          </g>
        </svg>
      </div>
    </div>
  );
}
