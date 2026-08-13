import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * public/sw.js antes era idéntico entre despliegues. Por eso una PWA que
 * quedaba abierta no detectaba la versión nueva y seguía ejecutando chunks
 * antiguos (justo el código previo que demoraba fotos y reportes). Se inserta
 * un id distinto en el artefacto final de cada build: el navegador instala el
 * Service Worker nuevo, este avisa a las ventanas y main.tsx recarga una vez.
 * No añade red, Functions, Firestore ni servicios de pago.
 */
function versionarServiceWorker() {
  const raiz = dirname(fileURLToPath(import.meta.url));
  const buildId = `${Date.now().toString(36)}`;
  return {
    name: "vista360-versionar-service-worker",
    closeBundle() {
      const ruta = resolve(raiz, "dist/sw.js");
      const contenido = readFileSync(ruta, "utf8");
      writeFileSync(ruta, contenido.replace("__VISTA360_BUILD__", buildId));
    },
  };
}

export default defineConfig({
  plugins: [react(), versionarServiceWorker()],
  server: {
    port: 5174,
  },
  build: {
    target: "es2019",
    // No se publican mapas con el frontend: hoy no existe un receptor
    // privado (Sentry, etc.) que los consuma y representaban 8.1 MB del
    // artefacto, además de exponer el fuente original de producción.
    sourcemap: false,
    // El aviso de Vite compara el tamaño SIN comprimir (600KB), pero lo
    // que de verdad baja el navegador es el gzip (~140KB) — razonable
    // para una app con Firebase. Subimos el umbral para no generar
    // ruido por algo que ya está optimizado.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        principal: resolve(dirname(fileURLToPath(import.meta.url)), "index.html"),
        visorPdf: resolve(dirname(fileURLToPath(import.meta.url)), "visor-pdf.html"),
      },
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
        // NOMBRES NEUTROS, Y NO ES COSMETICA.
        //
        // Estos trozos se llamaban vendor-firebase-firestore, vendor-firebase-auth
        // y vendor-firebase. Dos problemas distintos, los dos resueltos por
        // cambiar el nombre:
        //
        // 1. Cloudflare cachea por URL exacta. Si alguien pide una de estas
        //    rutas ANTES de que el despliegue la publique, el borde guarda la
        //    respuesta de "no existe" (el index.html del SPA) y sigue
        //    sirviendola cuando el archivo ya existe. El navegador pide un
        //    modulo, recibe HTML, y la aplicacion se queda en negro. Paso de
        //    verdad: el trozo de Firestore quedo envenenado en el borde y la
        //    aplicacion no cargaba ni en escritorio ni en movil, mientras la
        //    MISMA url con "?x=1" devolvia 200 application/javascript.
        //
        // 2. Los bloqueadores de publicidad filtran por texto de la URL.
        //    Un cliente con uBlock que caiga en una regla contra "firebase"
        //    ve la aplicacion en blanco, y eso es una llamada a soporte que
        //    no se diagnostica nunca.
        //
        // Los nombres nuevos describen para que sirve cada trozo, que ademas
        // se lee mejor en el panel de red.
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "nucleo-interfaz";
          }
          if (id.includes("node_modules/firebase/auth") || id.includes("node_modules/@firebase/auth")) {
            return "nucleo-sesion";
          }
          if (id.includes("node_modules/firebase/firestore") || id.includes("node_modules/@firebase/firestore")) {
            return "nucleo-datos";
          }
          if (id.includes("node_modules/firebase") || id.includes("node_modules/@firebase")) {
            return "nucleo-base";
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
    // Los tests de src/seguridad/ atacan las reglas de Firestore contra
    // el emulador de verdad, así que necesitan Java y el emulador
    // levantado. Se dejan fuera de la suite normal (que tiene que poder
    // correr en cualquier máquina, sin nada instalado) y corren en su
    // propio job del CI, con `npm run test:reglas`.
    exclude: ["node_modules/**", "src/seguridad/**"],
  },
});
