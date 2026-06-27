import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getFirestore,
  enableIndexedDbPersistence,
  type Firestore,
} from "firebase/firestore";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  type Auth,
} from "firebase/auth";
import { env, envMissing } from "./env";

let app: FirebaseApp | null = null;
export let db: Firestore | null = null;
export let auth: Auth | null = null;

// Solo inicializamos Firebase si TODAS las variables de entorno están
// presentes. Si falta alguna, dejamos db/auth en null a propósito —
// App.tsx detecta esto (vía envMissing) y muestra en pantalla qué
// variable falta, en vez de que la app truene en silencio con una
// pantalla negra que nadie puede diagnosticar sin abrir la consola.
if (envMissing.length === 0) {
  app = initializeApp(env.firebase);
  db = getFirestore(app);
  auth = getAuth(app);

  // Persistencia offline: si el panel pierde internet, sigue mostrando
  // el último contenido que alcanzó a sincronizar en vez de quedarse
  // en blanco. Falla silenciosamente en pestañas múltiples / navegadores
  // sin soporte — no es crítico, solo una mejora de resiliencia.
  enableIndexedDbPersistence(db).catch(() => {
    /* no-op: el player sigue funcionando sin cache offline */
  });
}

/**
 * Cada dispositivo se autentica de forma anónima — no hay usuario humano
 * frente a la pantalla para escribir credenciales. Las reglas de Firestore
 * distinguen un login anónimo (solo puede leer `contenidoDigital` y
 * escribir su propio `playersStatus`) de un admin humano real.
 */
export function ensureSignedIn(): Promise<void> {
  if (!auth) {
    return Promise.reject(new Error("Firebase no está configurado (faltan variables de entorno)."));
  }
  const activeAuth = auth;
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(activeAuth, (user) => {
      unsub();
      if (user) {
        resolve();
        return;
      }
      signInAnonymously(activeAuth).then(() => resolve()).catch(reject);
    }, reject);
  });
}
