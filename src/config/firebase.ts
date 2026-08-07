import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
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

type LimpiadorDeSesion = () => void | Promise<void>;
const limpiadoresDeSesion = new Set<LimpiadorDeSesion>();

/** Permite que los módulos con cachés/listeners globales se limpien sin
 * crear dependencias circulares desde la configuración de Firebase. */
export function registrarLimpiezaDeSesion(limpiador: LimpiadorDeSesion): () => void {
  limpiadoresDeSesion.add(limpiador);
  return () => limpiadoresDeSesion.delete(limpiador);
}

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
  db = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,

    // ── CACHÉ LOCAL EN EL DISPOSITIVO ────────────────────────────────
    //
    // Es la optimización de coste con mejor relación beneficio/riesgo de
    // toda la aplicación, y estaba sin activar.
    //
    // Sin ella, cada vez que alguien abre la app se vuelven a descargar
    // (y a PAGAR) los mismos documentos: sus campañas, su ficha, el
    // inventario... aunque no haya cambiado absolutamente nada desde
    // hace cinco minutos. Y el uso real de esta app es justamente ese:
    // la misma persona entrando varias veces al día desde el mismo
    // teléfono.
    //
    // Con la caché, Firestore guarda los documentos en el dispositivo y
    // al reconectar solo pide lo que CAMBIÓ. La segunda visita del día,
    // y la tercera, y la décima, cuestan casi cero.
    //
    // NO se pierde el tiempo real: las escuchas siguen recibiendo los
    // cambios del servidor igual que antes. La caché solo evita volver a
    // bajar lo que ya se tiene idéntico. Y como efecto secundario, la
    // app abre más rápido y aguanta mejor un túnel o un ascensor: los
    // datos ya están, no hay pantalla en blanco esperando la red.
    //
    // persistentMultipleTabManager por si alguien abre la app en dos
    // pestañas: sin él, la segunda se queda sin caché (el modo por
    // defecto solo deja usarla a una). Pasa más de lo que parece --
    // basta con abrir un reporte en una pestaña nueva.
    //
    // Si el navegador no deja usar almacenamiento local (Safari en modo
    // privado, o el disco lleno), Firestore lo detecta y sigue
    // funcionando contra el servidor como hasta ahora: se pierde el
    // ahorro, no la aplicación.
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
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
  // Primero cortar listeners y vaciar cachés en memoria. allSettled evita
  // que un limpiador secundario pueda impedir el cierre de sesión.
  await Promise.allSettled(Array.from(limpiadoresDeSesion, (limpiar) => Promise.resolve().then(limpiar)));
  try {
    // Las URLs firmadas dan acceso directo a archivos privados hasta su
    // vencimiento. No deben sobrevivir a un logout en un equipo compartido,
    // incluso si el módulo que normalmente las gestiona no llegó a cargarse.
    localStorage.removeItem("v360_signed_urls_v1");
  } catch {
    // localStorage puede no estar disponible en Safari privado.
  }
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
