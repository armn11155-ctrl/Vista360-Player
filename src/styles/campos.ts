import type { CSSProperties } from "react";

/**
 * Estilo compartido de los campos de formulario.
 *
 * Estaba definido por separado en NuevaCampana, Paneles y CrearCliente, y
 * las tres copias ya habían empezado a divergir. Al ser un objeto y no
 * CSS, cada pantalla puede seguir ajustando lo suyo con {...campoBase, ...}
 * sin tener que reescribir la base.
 */
export const campoBase: CSSProperties = {
  width: "100%",
  background: "#fff",
  border: "1.5px solid #E5E7EB",
  borderRadius: 12,
  padding: "12px 14px",
  fontSize: 14,
  color: "#0B1220",
  outline: "none",
  boxSizing: "border-box",
  // Un input de fecha en iOS pide más ancho del que le toca si conserva su
  // apariencia nativa, y se sale de la tarjeta. minWidth/maxWidth lo atan
  // al contenedor.
  minWidth: 0,
  maxWidth: "100%",
  fontFamily: "inherit",
};

/** Igual, pero con la flechita del desplegable dibujada a mano (la nativa
 *  se ve distinta en cada navegador). */
export const campoSelect: CSSProperties = {
  ...campoBase,
  appearance: "none",
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 14px center",
};
