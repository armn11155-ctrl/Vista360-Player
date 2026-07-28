/**
 * Helpers de rol para el equipo interno (no clientes). Centralizados
 * acá porque el mismo criterio se repite en muchas Cloud Functions:
 * antes cada una comparaba `role !== "admin"` a mano, y agregar un
 * segundo rol interno ("trabajador") hubiera significado tocar esa
 * misma comparación en más de una docena de archivos, con el riesgo
 * de dejar alguno desactualizado.
 *
 * "admin" es, de cara al usuario, el "Gerente" -- el nombre interno
 * del rol en Firestore NO cambió (para no tener que migrar datos ni
 * tocar cada función que ya lo comparaba), solo cambió cómo se
 * llama en las pantallas.
 */
export function esGerente(role: unknown): boolean {
  return role === "admin";
}

export function esTrabajador(role: unknown): boolean {
  return role === "trabajador";
}

/** Cualquiera de los dos roles internos (Gerente o Trabajador), en
 *  contraposición a "cliente". Se usa para las acciones que un
 *  Trabajador puede hacer LIBREMENTE (crear/editar clientes, campañas,
 *  reportes) -- las que necesitan aprobación del Gerente se validan
 *  aparte, con esGerente()/esTrabajador() por separado. */
export function esPersonalInterno(role: unknown): boolean {
  return esGerente(role) || esTrabajador(role);
}
