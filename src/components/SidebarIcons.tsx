interface Props {
  size?: number;
}

/** Íconos del sidebar de Vista360 Player.
 *
 * Todos usan currentColor (heredan el color de texto del ítem —
 * blanco en escritorio, azul marino en el drawer móvil) para que se
 * vean consistentes entre sí y se adapten solos al tema, en vez de
 * quedar pegados a colores fijos.
 *
 * IconInicio, IconMisPantallas: adaptados directo de los SVG que
 * mandó el cliente (solo se cambió el color fijo por currentColor).
 *
 * IconReportes, IconContactanos, IconPortafolio, IconAnalitica,
 * IconCerrar: simplificados a partir de los SVG originales (eran
 * ilustraciones a color con muchas capas decorativas) para que se
 * vean limpios como ícono chico de menú.
 *
 * IconFacturas, IconCobertura: diseño propio desde cero — los SVG
 * originales eran ilustraciones muy detalladas, pensadas para verse
 * grandes, no como ícono de 20px en un menú lateral. */

export function IconInicio({ size = 20 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M8 0L0 6V8H1V15H4V10H7V15H15V8H16V6L14 4.5V1H11V2.25L8 0ZM9 10H12V13H9V10Z" fill="currentColor" />
    </svg>
  );
}

export function IconMisPantallas({ size = 20 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg">
      <path fill="currentColor" d="M 5.4536 43.0962 L 50.5464 43.0962 C 54.1747 43.0962 56 41.3561 56 37.6426 L 56 13.3243 C 56 9.6108 54.1747 7.8708 50.5464 7.8708 L 5.4536 7.8708 C 1.8249 7.8708 0 9.6108 0 13.3243 L 0 37.6426 C 0 41.3561 1.8249 43.0962 5.4536 43.0962 Z M 43.4374 48.9953 C 43.4374 47.8919 42.5465 47.0007 41.4639 47.0007 L 14.4933 47.0007 C 13.4111 47.0007 12.5411 47.8919 12.5411 48.9953 C 12.5411 50.0988 13.4111 50.9901 14.4933 50.9901 L 41.4639 50.9901 C 42.5465 50.9901 43.4374 50.0988 43.4374 48.9953 Z" />
    </svg>
  );
}

export function IconReportes({ size = 20 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 4C6.34315 4 5 5.34315 5 7V41C5 42.6569 6.34315 44 8 44H40C41.6569 44 43 42.6569 43 41V24C43 22.8954 42.1046 22 41 22H35V7C35 5.34315 33.6569 4 32 4H8Z"
        stroke="currentColor" strokeWidth="3.2" strokeLinejoin="round" />
      <path d="M35 24V44" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="round" />
      <path d="M12 14H24M12 22H24M12 30H20" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

export function IconContactanos({ size = 20 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="8" r="4.2" fill="currentColor" />
      <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" fill="currentColor" />
    </svg>
  );
}

export function IconPortafolio({ size = 20 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2.5" y="7.5" width="19" height="12.5" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5" stroke="currentColor" strokeWidth="2" />
      <path d="M2.5 13H21.5" stroke="currentColor" strokeWidth="2" />
      <rect x="10.5" y="11.5" width="3" height="3" rx="0.5" fill="currentColor" />
    </svg>
  );
}

export function IconAnalitica({ size = 20 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 20V13M9 20V9M14 20V15M19 20V6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M14 5h5v5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 5.5 12.5 12 9 9l-4.5 4.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconCerrar({ size = 14 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** Diseño propio — recibo/factura simple con línea de detalle y "S/". */
export function IconFacturas({ size = 20 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6 2h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"
        stroke="currentColor" strokeWidth="2" strokeLinejoin="round"
      />
      <path d="M15 2v4a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 12h8M8 16h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Diseño propio — mapa doblado con un pin de ubicación encima. */
export function IconCobertura({ size = 20 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9 5 3 7v13l6-2 6 2 6-2V5l-6 2-6-2z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
      />
      <path d="M9 5v13M15 7v13" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M17 2.5a3.6 3.6 0 0 0-3.6 3.6c0 2.4 3.6 6.4 3.6 6.4s3.6-4 3.6-6.4A3.6 3.6 0 0 0 17 2.5z"
        fill="currentColor"
      />
      <circle cx="17" cy="6" r="1.3" fill="white" />
    </svg>
  );
}
