interface Props {
  label?: string;
  /** Las pantallas de admin sin cliente elegido (selector, login) usan
   *  fondo oscuro -- todo lo demás (Cobertura, Facturas, Usuarios,
   *  Paneles, campañas, etc.) ya es tema claro, así que por defecto
   *  el loader también es claro. Antes era siempre oscuro y se veía
   *  como un destello de "pantalla negra" al cambiar a esas pantallas
   *  claras mientras cargaba su código. */
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
