/**
 * Se separó del componente OnboardingTour a propósito.
 *
 * App.tsx necesita saber, apenas arranca, si hay que mostrar el tour --
 * y para eso solo hace falta leer una bandera de localStorage. Mientras
 * esta función vivía dentro de OnboardingTour.tsx, importarla obligaba a
 * meter el componente entero (con todos sus SVG) en el bundle inicial,
 * aunque el 99% de las veces el tour ya se vio y nunca se muestra.
 *
 * Ahora el componente se carga solo cuando de verdad se va a mostrar.
 */

const STORAGE_KEY = "vista360_onboarding_visto";

/** La bandera se guarda POR uid, así cada cuenta nueva ve el tour la
 *  primera vez, aunque otras cuentas ya lo hayan visto en ese equipo. */
export function claveOnboarding(uid?: string) {
  return uid ? `${STORAGE_KEY}:${uid}` : STORAGE_KEY;
}

export function debeVerOnboarding(uid?: string): boolean {
  try {
    return localStorage.getItem(claveOnboarding(uid)) !== "1";
  } catch {
    return false; // si localStorage falla (modo privado), no molestamos
  }
}

export function marcarOnboardingVisto(uid?: string) {
  try {
    localStorage.setItem(claveOnboarding(uid), "1");
  } catch {
    // sin problema: en el peor caso el tour se vuelve a mostrar
  }
}
