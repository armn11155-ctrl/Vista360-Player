/**
 * Modalidad de un soporte -- copia server-side de la lógica de
 * src/types/index.ts (los dos proyectos no comparten código: functions
 * compila aparte, con su propio tsconfig).
 *
 *  - "led": pantalla digital, rota anuncios -> varios clientes a la vez.
 *  - "lona": lona/mural/paradero/valla impresa, UNA sola pieza física
 *    con una sola cara -> EXCLUSIVA, un solo cliente por rango de fechas.
 *  - "unipolar": impreso, pero con DOS caras -> hasta DOS clientes a la
 *    vez (uno por cara), nunca un tercero cruzado en fechas.
 *
 * Si se cambia la deducción de un lado, cambiarla también del otro.
 */
export type PanelModalidad = "led" | "lona" | "unipolar";

const PISTAS_UNIPOLAR = ["unipolar"];
const PISTAS_LONA = ["lona", "mural", "paradero", "banner", "impres", "valla", "gigantograf", "panel tradicional"];

export function modalidadDePanel(panel: { modalidad?: unknown; tipo?: unknown }): PanelModalidad {
  const m = panel.modalidad;
  if (m === "led" || m === "lona" || m === "unipolar") return m;
  const t = String(panel.tipo ?? "").toLowerCase();
  if (PISTAS_UNIPOLAR.some((pista) => t.includes(pista))) return "unipolar";
  if (t.includes("led") || t.includes("digital") || t.includes("pantalla")) return "led";
  if (PISTAS_LONA.some((pista) => t.includes(pista))) return "lona";
  // Sin pistas: LED, que es como se venía comportando el sistema.
  return "led";
}

/** true si el soporte admite un solo cliente a la vez (lona/mural/paradero).
 *  OJO: un unipolar es impreso pero admite DOS, así que esto da false para
 *  unipolar -- para el cupo real usar cuposPanel(). Se conserva esta
 *  función (en vez de borrarla) porque el resto del código todavía la usa
 *  para decidir si mostrar "libre desde" y mensajes de una sola pieza. */
export function esPanelExclusivo(panel: { modalidad?: unknown; tipo?: unknown }): boolean {
  return modalidadDePanel(panel) === "lona";
}

/** Cuántas campañas cruzadas en fechas admite el panel a la vez.
 *  Infinity en LED (rota anuncios, no hay límite real). */
export function cuposPanel(panel: { modalidad?: unknown; tipo?: unknown }): number {
  const m = modalidadDePanel(panel);
  if (m === "unipolar") return 2;
  if (m === "lona") return 1;
  return Infinity;
}
