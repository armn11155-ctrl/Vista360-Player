import type { Contrato, InformeCliente, Panel } from "../types";
import { panelesDeContrato } from "../types";
import { formatCampaignName } from "./campaignName";

/**
 * Nombre que debe mostrar el frontend para un reporte.
 *
 * `contratoNombre` es una foto histórica tomada al generar el PDF. Cuando la
 * campaña todavía existe, la fuente de verdad es el contrato actual para que
 * una edición se refleje de inmediato sin modificar el PDF ya generado.
 */
export function nombreCampanaVisibleEnReporte(
  informe: InformeCliente,
  contratos: Contrato[],
  paneles: Record<string, Panel>,
): string {
  const contratoActual = informe.contratoId
    ? contratos.find((contrato) => contrato.id === informe.contratoId)
    : undefined;

  if (contratoActual) {
    const nombreActual = formatCampaignName(contratoActual.nombre ?? "");
    if (nombreActual) return nombreActual;

    const nombresPaneles = panelesDeContrato(contratoActual)
      .map((panelId) => paneles[panelId]?.nombre)
      .filter((nombre): nombre is string => Boolean(nombre?.trim()))
      .join(" + ");
    return formatCampaignName(nombresPaneles) || "Reporte mensual";
  }

  return formatCampaignName(informe.contratoNombre ?? "") || "Reporte mensual";
}
