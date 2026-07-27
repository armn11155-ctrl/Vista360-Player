/**
 * Modalidad de un soporte -- copia server-side de la lógica de
 * src/types/index.ts (los dos proyectos no comparten código: functions
 * compila aparte, con su propio tsconfig).
 *
 *  - "led": pantalla digital, rota anuncios -> varios clientes a la vez.
 *  - "lona": lona/mural/valla impresa, una sola pieza física instalada
 *    -> EXCLUSIVA, un solo cliente por rango de fechas.
 *
 * Si se cambia la deducción de un lado, cambiarla también del otro.
 */
export type PanelModalidad = "led" | "lona";

const PISTAS_LONA = ["lona", "mural", "banner", "impres", "valla", "gigantograf", "panel tradicional"];

export function modalidadDePanel(panel: { modalidad?: unknown; tipo?: unknown }): PanelModalidad {
  const m = panel.modalidad;
  if (m === "led" || m === "lona") return m;
  const t = String(panel.tipo ?? "").toLowerCase();
  if (t.includes("led") || t.includes("digital") || t.includes("pantalla")) return "led";
  if (PISTAS_LONA.some((pista) => t.includes(pista))) return "lona";
  // Sin pistas: LED, que es como se venía comportando el sistema.
  return "led";
}

export function esPanelExclusivo(panel: { modalidad?: unknown; tipo?: unknown }): boolean {
  return modalidadDePanel(panel) === "lona";
}
