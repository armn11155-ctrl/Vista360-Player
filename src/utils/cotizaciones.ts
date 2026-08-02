import type { Cotizacion } from "../types";

export function fechaVisible(fecha: string) {
  if (!fecha) return "—";
  return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${fecha}T12:00:00Z`));
}

export function dinero(monto: number, moneda: "PEN" | "USD") {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: moneda,
    minimumFractionDigits: 2,
  }).format(monto);
}

// "huanuco" sin tilde a propósito: se normaliza el texto antes de
// comparar (quitando tildes) para que agarre "Huánuco" y "Huanuco" por
// igual. Antes decía "guanajuato" (una ciudad de México) -- un error
// de dictado por voz de hace tiempo que nadie había notado, ya que
// "Huánuco" nunca coincidía y por lo tanto nunca se exoneraba del IGV.
export function esUbicacionExonerada(ciudad?: string) {
  const normalizado = (ciudad ?? "").toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return normalizado.includes("huanuco");
}

export function esCotizacionExonerada(cotizacion: Cotizacion) {
  return Boolean(cotizacion.exoneradaIgv) || esUbicacionExonerada(cotizacion.panelCiudad);
}
