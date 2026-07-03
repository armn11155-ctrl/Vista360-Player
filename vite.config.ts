import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
  build: {
    target: "es2019",
    sourcemap: true,
    // El aviso de Vite compara el tamaño SIN comprimir (600KB), pero lo
    // que de verdad baja el navegador es el gzip (~140KB) — razonable
    // para una app con Firebase. Subimos el umbral para no generar
    // ruido por algo que ya está optimizado.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Separa las librerías grandes en su propio archivo, igual que el
        // ERP. El navegador cachea vendor-firebase/vendor-react aparte del
        // código de la app — así, cuando subimos un cambio nuestro (que
        // pasa seguido), el usuario no tiene que volver a descargar
        // Firebase completo, solo el chunk chico que sí cambió.
        //
        // Firebase además se separa en auth/firestore aparte del resto
        // (app, analytics, etc.) — pantallas que solo necesitan leer datos
        // (la mayoría) no tienen que esperar a que cargue todo el SDK de
        // autenticación de una, se pueden descargar en paralelo.
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "vendor-react";
          }
          if (id.includes("node_modules/firebase/auth") || id.includes("node_modules/@firebase/auth")) {
            return "vendor-firebase-auth";
          }
          if (id.includes("node_modules/firebase/firestore") || id.includes("node_modules/@firebase/firestore")) {
            return "vendor-firebase-firestore";
          }
          if (id.includes("node_modules/firebase") || id.includes("node_modules/@firebase")) {
            return "vendor-firebase";
          }
        },
      },
    },
  },
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
