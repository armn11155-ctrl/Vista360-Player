import type { Contrato } from "../types";

export type NivelCliente = "Bronce" | "Plata" | "Oro";

export interface InfoNivelCliente {
  nivel: NivelCliente;
  meses: number;
  desde: string; // "YYYY-MM-DD" del contrato más antiguo
}

/**
 * Nivel de cliente por antigüedad -- pedido explícito ("insignia
 * premium"). Se calcula solo, a partir de la fecha del contrato más
 * viejo (sin contar los eliminados): no hace falta que nadie asigne
 * nada a mano.
 *
 * Bronce: menos de 6 meses como cliente.
 * Plata: de 6 a 11 meses.
 * Oro: 12 meses o más.
 */
export function nivelCliente(contratos: Contrato[]): InfoNivelCliente | null {
  const fechas = contratos
    .filter((c) => !c.deleted && typeof c.inicio === "string" && c.inicio)
    .map((c) => c.inicio);
  if (fechas.length === 0) return null;

  const primera = fechas.reduce((min, f) => (f < min ? f : min));
  const inicio = new Date(`${primera}T00:00:00`);
  const hoy = new Date();
  const meses = Math.max(
    0,
    (hoy.getFullYear() - inicio.getFullYear()) * 12 + (hoy.getMonth() - inicio.getMonth())
  );

  const nivel: NivelCliente = meses >= 12 ? "Oro" : meses >= 6 ? "Plata" : "Bronce";
  return { nivel, meses, desde: primera };
}

export const NIVEL_COLOR: Record<NivelCliente, { bg: string; text: string; borde: string }> = {
  Bronce: { bg: "rgba(180,83,9,0.14)", text: "#B45309", borde: "rgba(180,83,9,0.32)" },
  Plata: { bg: "rgba(100,116,139,0.14)", text: "#475569", borde: "rgba(100,116,139,0.32)" },
  Oro: { bg: "rgba(202,138,4,0.16)", text: "#A16207", borde: "rgba(202,138,4,0.36)" },
};
