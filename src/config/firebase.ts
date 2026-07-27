import { initializeApp, type FirebaseApp } from "firebase/app";
import { initializeFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type Auth,
  type User,
} from "firebase/auth";
import { env, envMissing } from "./env";

export let app: FirebaseApp | null = null;
export let db: Firestore | null = null;
export let auth: Auth | null = null;
export let cloudFunctions: Functions | null = null;

// Solo inicializamos Firebase si TODAS las variables de entorno están
// presentes. Si falta alguna, dejamos db/auth en null a propósito —
// App.tsx detecta esto (vía envMissing) y muestra en pantalla qué
// variable falta, en vez de una pantalla en blanco sin explicación.
if (envMissing.length === 0) {
  app = initializeApp(env.firebase);
  // Safari (con sus protecciones de privacidad) bloquea el tipo de
  // conexión en tiempo real que Firestore usa por defecto, y las
  // pantallas que dependen de listeners en vivo (como Reportes) se
  // quedan sin actualizar aunque el dato ya exista. Con
  // experimentalAutoDetectLongPolling, Firestore detecta esto solo y
  // cambia a "long polling" (peticiones normales repetidas) en vez de
  // la conexión que Safari bloquea.
  db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  auth = getAuth(app);
  cloudFunctions = getFunctions(app);
}

/**
 * Cada cliente entra con el email/contraseña que el dueño le creó
 * desde Vista360 (ver scripts/crear-acceso-cliente.mjs en el repo
 * Vista360). No hay auto-registro: si no tienes cuenta, no entras.
 */
export function login(email: string, password: string): Promise<void> {
  if (!auth) return Promise.reject(new Error("Firebase no está configurado."));
  return signInWithEmailAndPassword(auth, email, password).then(() => undefined);
}

/**
 * Vacía todo lo que el navegador dejó guardado de esta sesión.
 *
 * El Service Worker ya no cachea archivos privados, pero lo que quedó
 * guardado ANTES de ese arreglo sigue ahí: en un equipo compartido, quien
 * entre después podría recuperar facturas o fotos del cliente anterior
 * desde el CacheStorage. Cambiar la política no borra el pasado, así que
 * se limpia explícitamente al salir.
 *
 * Nunca hace fallar el cierre de sesión: si algo de esto no se puede
 * hacer, sigue siendo mucho más importante cerrar la sesión igual.
 */
async function limpiarRastroLocal(): Promise<void> {
  try {
    const registro = await navigator.serviceWorker?.ready;
    registro?.active?.postMessage({ tipo: "limpiar-cache" });
  } catch {
    // sin Service Worker (o bloqueado): se sigue con el borrado directo
  }
  try {
    if (typeof caches !== "undefined") {
      const claves = await caches.keys();
      await Promise.all(claves.map((k) => caches.delete(k)));
    }
  } catch {
    // en modo privado caches puede no existir -- no es motivo para fallar
  }
}

export async function logout(): Promise<void> {
  if (!auth) return;
  // Primero cerrar sesión (lo esencial), después limpiar (lo deseable).
  await firebaseSignOut(auth);
  await limpiarRastroLocal();
}

export function onUserChange(cb: (user: User | null) => void): () => void {
  if (!auth) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, cb);
}
