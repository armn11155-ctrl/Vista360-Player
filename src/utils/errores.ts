/**
 * Traductor único de errores de Firebase a algo que una persona entienda.
 *
 * Antes esto estaba resuelto a mano en 10 lugares distintos, cada uno con
 * su propia limpieza del prefijo "FirebaseError: " y su propio texto de
 * respaldo. El resultado era que el mismo problema (quedarse sin señal,
 * por ejemplo) se veía distinto según en qué pantalla te agarrara: unas
 * mostraban el error técnico crudo, otras un texto genérico, otras nada.
 */

/** Códigos de Cloud Functions y de Firestore, con su explicación útil. */
const MENSAJES: Record<string, string> = {
  unauthenticated: "Tu sesión expiró. Vuelve a entrar.",
  "permission-denied": "No tienes permiso para hacer esto.",
  unavailable: "Sin conexión. Revisa tu internet e intenta de nuevo.",
  "deadline-exceeded": "La conexión está muy lenta. Intenta de nuevo.",
  "not-found": "No se encontró lo que buscabas. Puede que ya se haya eliminado.",
  "already-exists": "Eso ya existe.",
  "resource-exhausted": "Demasiados intentos seguidos. Espera un momento.",
  cancelled: "La operación se canceló.",
  internal: "Algo falló de nuestro lado. Intenta de nuevo en un momento.",
};

/** Errores del navegador que no traen código de Firebase. */
function esFalloDeRed(mensaje: string): boolean {
  const m = mensaje.toLowerCase();
  return (
    m.includes("network") ||
    m.includes("failed to fetch") ||
    m.includes("internet") ||
    m.includes("offline")
  );
}

/**
 * @param error   Lo que vino del catch.
 * @param respaldo Qué decir si no se reconoce el error. Debe ser
 *                 específico de la acción ("No se pudo guardar el panel"),
 *                 no genérico -- es lo que el usuario va a leer.
 */
export function mensajeDeError(error: unknown, respaldo: string): string {
  // Antes de mirar el error: si el navegador ya sabe que no hay red, eso
  // explica el problema mejor que cualquier código.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "Sin conexión. Revisa tu internet e intenta de nuevo.";
  }

  const codigo = (error as { code?: unknown })?.code;
  if (typeof codigo === "string") {
    // Los códigos vienen como "functions/permission-denied" o
    // "permission-denied" según de dónde salga el error.
    const corto = codigo.includes("/") ? codigo.split("/").pop()! : codigo;
    if (MENSAJES[corto]) return MENSAJES[corto];
  }

  // Ojo: no basta con `instanceof Error`. Algunos errores llegan como
  // objetos planos con .message (según por dónde pase el SDK), y
  // String(obj) los convierte en "[object Object]" -- que es exactamente
  // el tipo de mensaje inútil que esto viene a evitar.
  const crudo =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown })?.message === "string"
        ? String((error as { message: string }).message)
        : typeof error === "string"
          ? error
          : "";
  if (esFalloDeRed(crudo)) {
    return "Sin conexión. Revisa tu internet e intenta de nuevo.";
  }

  // Un mensaje que ya viene escrito para el usuario desde una Cloud
  // Function (por ejemplo "Este cliente ya tiene una campaña...") es más
  // útil que el respaldo genérico. Se limpia el prefijo técnico y se usa.
  const limpio = crudo
    .replace(/^FirebaseError:\s*/i, "")
    .replace(/^functions\/[a-z-]+:\s*/i, "")
    .trim();

  // Si lo que queda parece jerga (sin espacios, o un código pelado), mejor
  // el respaldo: un mensaje incomprensible es peor que uno genérico.
  if (!limpio || !limpio.includes(" ")) return respaldo;
  return limpio;
}
