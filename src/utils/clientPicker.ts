import type { Cliente } from "../types";

/** Ordena por campañas activas (más primero) y usa empresa para desempatar. */
export function ordenarClientesPorCampanasActivas(
  clientes: Cliente[],
  campanasActivas: Record<string, number>
): Cliente[] {
  return [...clientes].sort((a, b) => {
    const diferencia = (campanasActivas[b.id] ?? 0) - (campanasActivas[a.id] ?? 0);
    if (diferencia !== 0) return diferencia;
    return (a.empresa ?? "").localeCompare(b.empresa ?? "", "es", { sensitivity: "base" });
  });
}

/** Filtra clientes por nombre de empresa, sin distinguir mayúsculas. */
export function filtrarClientes(clientes: Cliente[], busqueda: string): Cliente[] {
  const q = busqueda.toLowerCase().trim();
  if (!q) return clientes;
  return clientes.filter((c) => c.empresa?.toLowerCase().includes(q));
}
