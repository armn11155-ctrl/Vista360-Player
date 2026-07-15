import { initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
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
  db = getFirestore(app);
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

export function logout(): Promise<void> {
  if (!auth) return Promise.resolve();
  return firebaseSignOut(auth);
}

export function onUserChange(cb: (user: User | null) => void): () => void {
  if (!auth) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, cb);
}
