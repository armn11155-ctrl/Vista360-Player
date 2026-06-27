/**
 * Lee las variables de entorno de Firebase. A propósito NUNCA lanza un
 * error aquí (eso dejaría la pantalla en blanco sin ninguna pista). En
 * vez de eso, junta qué variables faltan en `envMissing` para que
 * App.tsx pueda mostrarlo directo en pantalla.
 */
const REQUIRED_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

function readEnv() {
  const missing: string[] = [];
  const values: Record<string, string> = {};
  for (const key of REQUIRED_KEYS) {
    const value = import.meta.env[key as keyof ImportMetaEnv];
    if (!value) {
      missing.push(key);
    } else {
      values[key] = value as string;
    }
  }
  return { missing, values };
}

const { missing, values } = readEnv();

/** Lista de variables VITE_FIREBASE_* que faltan. Vacía si todo está bien. */
export const envMissing: readonly string[] = missing;

export const env = {
  firebase: {
    apiKey: values.VITE_FIREBASE_API_KEY ?? "",
    authDomain: values.VITE_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: values.VITE_FIREBASE_PROJECT_ID ?? "",
    storageBucket: values.VITE_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: values.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: values.VITE_FIREBASE_APP_ID ?? "",
  },
  appVersion: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "0.1.0",
  // Opcional — solo lo usa la cuenta admin para subir evidencias. Si falta,
  // el botón de subir muestra un error puntual en vez de bloquear toda la app.
  cloudinary: {
    cloudName: (import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined) ?? "",
    uploadPreset: (import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined) ?? "",
  },
};
