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
    rollupOptions: {
      output: {
        // Separa las librerías grandes en su propio archivo, igual que el
        // ERP. El navegador cachea vendor-firebase/vendor-react aparte del
        // código de la app — así, cuando subimos un cambio nuestro (que
        // pasa seguido), el usuario no tiene que volver a descargar
        // Firebase completo, solo el chunk chico que sí cambió.
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "vendor-react";
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
