import { useId } from "react";

interface Props {
  valor: string;
  onCambio: (v: string) => void;
  /** Qué se puede escribir acá -- se usa de placeholder y de etiqueta accesible. */
  placeholder: string;
  /** Cuántos resultados quedaron, para avisar cuando no hay ninguno. */
  resultados?: number;
}

/**
 * Buscador de listas. Se hizo componente en vez de repetirlo en cada
 * pantalla porque el comportamiento fino (botón de limpiar, aviso de
 * "sin resultados", tipo "search" para que iOS muestre el teclado
 * correcto) conviene que sea idéntico en todas.
 *
 * Nota: `type="search"` en iOS agrega su propia X nativa; se apaga con
 * appearance:none en el CSS y se usa la nuestra, que sí es consistente
 * entre navegadores.
 */
export default function CampoBusqueda({ valor, onCambio, placeholder, resultados }: Props) {
  const id = useId();
  return (
    <div style={{ margin: "10px 0 12px" }}>
      <label htmlFor={id} className="sr-only">{placeholder}</label>
      <div style={{ position: "relative" }}>
        <span
          aria-hidden="true"
          style={{
            position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
            display: "flex", pointerEvents: "none",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="M21 21l-4.6-4.6" />
          </svg>
        </span>

        <input
          id={id}
          type="search"
          inputMode="search"
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          placeholder={placeholder}
          className="campo-busqueda"
        />

        {valor && (
          <button
            type="button"
            onClick={() => onCambio("")}
            aria-label="Limpiar búsqueda"
            style={{
              position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
              width: 32, height: 32, borderRadius: 999, border: "none", background: "transparent",
              color: "#64748B", fontSize: 19, lineHeight: 1, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            ×
          </button>
        )}
      </div>

      {valor && resultados === 0 && (
        <div style={{ fontSize: 12, color: "#64748B", marginTop: 8, paddingLeft: 2 }}>
          Nada coincide con “{valor}”.
        </div>
      )}
    </div>
  );
}
