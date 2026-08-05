import { defineConfig } from "vitest/config";

/**
 * Configuración aparte para los tests que atacan las reglas de
 * Firestore. Van separados porque necesitan el emulador levantado (y por
 * tanto Java 21), y la suite normal tiene que poder correr en cualquier
 * máquina sin nada instalado.
 *
 * Se lanzan con `npm run test:reglas`, con el emulador ya en marcha.
 * En el CI eso lo hace el job "Reglas de Firestore" de verificar.yml.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/seguridad/**/*.test.ts"],
    // Levantar el emulador y sembrar datos es más lento que un test
    // normal; el de por defecto (5s) se queda corto en un runner frío.
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
