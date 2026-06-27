import { initializeApp } from "firebase/app";
import {
  getFirestore,
  enableIndexedDbPersistence,
} from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { env } from "./env";

const app = initializeApp(env.firebase);

export const db = getFirestore(app);
export const auth = getAuth(app);

// Persistencia offline: si el panel pierde internet, sigue mostrando
// el último contenido que alcanzó a sincronizar en vez de quedarse
// en blanco. Falla silenciosamente en pestañas múltiples / navegadores
// sin soporte — no es crítico, solo una mejora de resiliencia.
enableIndexedDbPersistence(db).catch(() => {
  /* no-op: el player sigue funcionando sin cache offline */
});

/**
 * Cada dispositivo se autentica de forma anónima — no hay usuario humano
 * frente a la pantalla para escribir credenciales. Las reglas de Firestore
 * distinguen un login anónimo (solo puede leer `contenidoDigital` y
 * escribir su propio `playersStatus`) de un admin humano real.
 */
export function ensureSignedIn(): Promise<void> {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      if (user) {
        resolve();
        return;
      }
      signInAnonymously(auth).then(() => resolve()).catch(reject);
    }, reject);
  });
}
