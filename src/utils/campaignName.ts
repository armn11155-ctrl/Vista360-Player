export function formatCampaignName(value: string): string {
  const limpio = value.trim();
  if (!limpio) return "";
  return limpio.charAt(0).toLocaleUpperCase("es-PE") + limpio.slice(1);
}
