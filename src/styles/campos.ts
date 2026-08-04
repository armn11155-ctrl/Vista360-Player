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

;
