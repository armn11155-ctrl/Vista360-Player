import type { CSSProperties } from "react";

interface Props {
  label?: string;
  /** Se conserva por compatibilidad con las llamadas existentes. Todas
   *  las variantes usan ahora el mismo fondo blanco. */
  dark?: boolean;
}

// Todas las etapas de carga comparten este instante. Si React sustituye
// un loader por otro (auth -> clientes -> campañas), el agua continúa
// donde iba en vez de volver a empezar desde abajo.
const loaderInicio = Date.now();

export default function BrandLoader({ label = "Cargando", dark = false }: Props) {
  const segundosTranscurridos = Math.min((Date.now() - loaderInicio) / 1000, 2.4);
  const estilo = {
    "--brand-loader-delay": `${-segundosTranscurridos}s`,
  } as CSSProperties;

  return (
    <div className={`brand-loader${dark ? " brand-loader-dark" : ""}`} role="status" aria-label={label} style={estilo}>
      <div className="brand-loader-mark">
        <img className="brand-loader-logo brand-loader-logo-base" src="/vista360-loader-v.png" alt="" draggable={false} />
        <span className="brand-loader-liquid" aria-hidden="true">
          <img className="brand-loader-logo brand-loader-logo-fill" src="/vista360-loader-v.png" alt="" draggable={false} />
        </span>
      </div>
    </div>
  );
}
