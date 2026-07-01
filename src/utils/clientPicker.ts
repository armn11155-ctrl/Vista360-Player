import type { Cliente } from "../types";

/** Filtra clientes por nombre de empresa, sin distinguir mayúsculas. */
export function filtrarClientes(clientes: Cliente[], busqueda: string): Cliente[] {
  const q = busqueda.toLowerCase().trim();
  if (!q) return clientes;
  return clientes.filter((c) => c.empresa?.toLowerCase().includes(q));
}
