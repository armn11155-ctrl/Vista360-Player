/**
 * Lee y valida las variables de entorno necesarias. Si falta alguna
 * obligatoria, lanza un error descriptivo apenas arranca la app —
 * mejor fallar rápido y claro que tener una pantalla negra muda en
 * un panel físico al que no puedes conectar un teclado.
 */
function required(name: string): string {
  const value = import.meta.env[name as keyof ImportMetaEnv];
  if (!value) {
    throw new Error(
      `[env] Falta la variable ${name}. Copia .env.example a .env.local y completa los valores de Firebase (los mismos que usa Vista360).`
    );
  }
  return value as string;
}

export const env = {
  firebase: {
    apiKey: required("VITE_FIREBASE_API_KEY"),
    authDomain: required("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: required("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: required("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: required("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: required("VITE_FIREBASE_APP_ID"),
  },
  appVersion: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "0.1.0",
};
