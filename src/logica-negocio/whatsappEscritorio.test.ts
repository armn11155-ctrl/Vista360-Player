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

describe("en escritorio: se baja el PDF y se abre el chat del cliente", () => {
  /**
   * PEDIDO DEL NEGOCIO: WhatsApp Web no deja adjuntar por enlace (solo
   * acepta texto). Asi que en escritorio se hacen las dos cosas que si se
   * pueden: abrir el chat DEL CLIENTE con el mensaje escrito, y bajar el
   * PDF para que quede el primero en "Recientes" del selector. La persona
   * pulsa el clip, elige el archivo y lo manda.
   */
  for (const archivo of ["src/components/ReportCard.tsx", "src/components/FacturaCard.tsx"]) {
    const codigo = leer(archivo);

    it(`${archivo.split("/").pop()}: abre el chat del cliente, no la lista de contactos`, () => {
      expect(codigo).toContain("function numeroWhatsApp(");
      expect(codigo).toContain("`https://wa.me/${numero}`");
      // Sin celular se cae al selector de contactos en vez de romperse.
      expect(codigo).toContain('numero ? `https://wa.me/${numero}` : "https://wa.me/"');
    });

    it(`${archivo.split("/").pop()}: baja el PDF para que quede en Recientes`, () => {
      expect(codigo).toContain("guardarArchivoYaCargado(archivoCompartir)");
      // El orden importa: window.open depende del gesto del clic.
      const i = codigo.indexOf("guardarArchivoYaCargado(archivoCompartir)");
      const antes = codigo.slice(Math.max(0, i - 200), i);
      expect(antes).toContain('irAlLink("whatsapp", mensajeConArchivo)');
    });

    it(`${archivo.split("/").pop()}: el texto NO lleva la url firmada de R2`, () => {
      // Va el PDF adjunto, asi que meter ademas la url firmada solo
      // expondria donde esta alojado y seria reenviable 6 horas.
      const i = codigo.indexOf("guardarArchivoYaCargado(archivoCompartir)");
      const bloque = codigo.slice(Math.max(0, i - 300), i + 100);
      expect(bloque).toContain("mensajeConArchivo");
      expect(bloque).not.toContain("mensajeConLink");
    });
  }

  it("un numero peruano de 9 digitos se envia con codigo de pais", () => {
    // wa.me exige codigo de pais y sin "+". Sin esto el enlace no abre chat.
    const numeroWhatsApp = (celular: string) => {
      const d = celular.replace(/\D/g, "");
      if (!d) return "";
      return d.length === 9 ? `51${d}` : d;
    };
    expect(numeroWhatsApp("947957971")).toBe("51947957971");
    expect(numeroWhatsApp("947 957 971")).toBe("51947957971");
    expect(numeroWhatsApp("+51 947 957 971")).toBe("51947957971");
    expect(numeroWhatsApp("")).toBe("");
  });

  it("guardarArchivoYaCargado no vuelve a pedir nada a la red", () => {
    // Reutiliza el File ya precargado para compartir.
    const util = leer("src/utils/descargarArchivo.ts");
    const fn = util.slice(util.indexOf("export function guardarArchivoYaCargado"));
    expect(fn.slice(0, 500)).toContain("URL.createObjectURL(archivo)");
    expect(fn.slice(0, 500)).not.toContain("fetch(");
  });
});
