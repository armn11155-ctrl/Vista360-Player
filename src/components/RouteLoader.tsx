interface Props {
  label?: string;
}

/**
 * Espera de una ruta o de sus datos principales. Vive dentro del shell para
 * conservar la navegación y el contexto; el loader de marca a pantalla
 * completa queda reservado al arranque y a los cambios de sesión.
 */
export default function RouteLoader({ label = "Preparando la sección" }: Props) {
  return (
    <div className="route-loader" role="status" aria-live="polite" aria-label={label}>
      <div className="route-loader-header" aria-hidden="true">
        <span />
        <i />
        <span />
      </div>
      <div className="route-loader-body">
        <div className="route-loader-copy">
          <small>Vista360 Player</small>
          <strong>{label}</strong>
          <span>Estamos organizando la información para ti.</span>
        </div>
        <div className="route-loader-skeleton route-loader-skeleton-wide" aria-hidden="true" />
        <div className="route-loader-grid" aria-hidden="true">
          <div className="route-loader-skeleton" />
          <div className="route-loader-skeleton" />
          <div className="route-loader-skeleton" />
        </div>
      </div>
    </div>
  );
}
