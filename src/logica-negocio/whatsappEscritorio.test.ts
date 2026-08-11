import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * COMPROBADO EN PRODUCCION, en un Mac, con la sesion de Trabajador.
 *
 * Al pulsar WhatsApp el boton se quedaba en "Enviando..." para siempre.
 *
 * La causa: `navigator.share` EXISTE en Chrome de escritorio y
 * `canShare({files})` devuelve true, asi que se entraba por ese camino.
 * Pero share() abre la hoja del sistema y su promesa NO se resuelve hasta
 * que la persona la cierra -- el `finally` que limpia el estado no
 * llegaba a ejecutarse. Y esa hoja, en macOS, ni siquiera ofrece
 * WhatsApp: aunque no se colgara, no llevaria a donde se quiere ir.
 *
 * Es el mismo fallo que ya se corrigio en descargarArchivo.ts (donde
 * "Descargar" abria AirDrop en vez de bajar el archivo). Este quedo
 * fuera de aquel arreglo por estar en otro archivo.
 */
const RAIZ = resolve(__dirname, "../..");
const leer = (f: string) => readFileSync(resolve(RAIZ, f), "utf-8");
const compartir = leer("src/utils/compartirArchivo.ts");
const descargar = leer("src/utils/descargarArchivo.ts");

describe("WhatsApp en escritorio no puede quedarse en Enviando…", () => {
  it("el panel nativo se usa en MOVIL (iOS y Android), no en escritorio", () => {
    // La distincion importa: para DESCARGAR solo iOS necesita la hoja
    // (en Android la descarga normal funciona). Para COMPARTIR la
    // necesitan los dos, porque es lo unico que manda el PDF como
    // ARCHIVO ADJUNTO por WhatsApp -- el enlace de WhatsApp Web solo
    // acepta texto. Usar esIOS aqui dejaba a Android mandando un link
    // cuando podia mandar el archivo.
    const fn = compartir.slice(compartir.indexOf("puedeCompartirEsteArchivo"));
    expect(fn.slice(0, 1200)).toContain("if (!esMovil()) return false;");
  });

  it("esMovil cubre Android, esIOS no", () => {
    expect(descargar).toContain("export function esMovil(): boolean {");
    const fn = descargar.slice(descargar.indexOf("export function esMovil"));
    expect(fn.slice(0, 300)).toContain("/Android/i.test");
    // Y descargar SIGUE usando esIOS: ahi Android no necesita la hoja.
    expect(descargar).toContain("if (!esIOS()) return false;");
  });

  it("reutiliza el esIOS ya probado, no una copia nueva", () => {
    // Una segunda deteccion se desincroniza con la primera en cuanto
    // alguien arregle un caso raro en una sola de las dos.
    expect(compartir).toContain('import { esMovil, obtenerBlobArchivo } from "./descargarArchivo"');
    expect(descargar).toContain("export function esIOS(): boolean {");
    // Y no se duplica la deteccion dentro de compartirArchivo.
    expect(compartir).not.toContain("/iPhone|iPad|iPod/");
  });

  it("en escritorio se explica el motivo, no se calla", () => {
    expect(compartir).toContain("en escritorio se usa el enlace de WhatsApp");
  });

  it("el estado se limpia aunque el panel no responda nunca", () => {
    // Cinturon y tirantes: el finally ya limpia, pero si la promesa no
    // llega, el boton no puede quedar muerto hasta recargar la pagina.
    for (const archivo of ["src/components/ReportCard.tsx", "src/components/FacturaCard.tsx"]) {
      const codigo = leer(archivo);
      expect(codigo, archivo).toContain(".finally(() => setEnviando(null));");
      expect(codigo, archivo).toContain('actual === "whatsapp" ? null : actual');
    }
  });

  it("en escritorio se cae al enlace de WhatsApp, sin enviar nada solo", () => {
    // irAlLink abre WhatsApp con el mensaje puesto; el envio lo hace la
    // persona. Nunca se manda automaticamente.
    const tarjeta = leer("src/components/ReportCard.tsx");
    expect(tarjeta).toContain('irAlLink("whatsapp")');
    expect(tarjeta).toContain("if (puedeCompartirEsteArchivo(archivoCompartir))");
  });
});
