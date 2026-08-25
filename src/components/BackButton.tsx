import BackChevron from "./BackChevron";

interface Props {
  onClick: () => void;
  label?: string;
  className?: string;
}

/**
 * Acción de retorno compartida por las cabeceras internas.
 *
 * Mantenerla como un botón real permite foco, teclado y lector de pantalla
 * sin pedir a cada pantalla que vuelva a implementar esa semántica.
 */
export default function BackButton({ onClick, label = "Volver", className = "" }: Props) {
  return (
    <button
      type="button"
      className={`back-btn ${className}`.trim()}
      onClick={onClick}
      aria-label={label}
    >
      <BackChevron />
    </button>
  );
}
