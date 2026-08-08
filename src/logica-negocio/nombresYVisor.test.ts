import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { nombreDescargaSeguro } from "../../functions/src/validaciones.js";

const RAIZ = resolve(__dirname, "../..");
const leer = (f: string) => readFileSync(resolve(RAIZ, f), "utf-8");

describe("el visor no puede volver a dejar una pestaña en blanco", () => {
  /**
   * EL FALLO. `verArchivo` abría la pestaña con
   * `window.open("", "_blank", "noopener")`. Con `noopener`, window.open
   * DEVUELVE null -- está en la especificación, no es cosa de un
   * navegador concreto. Así que la función se quedaba sin referencia a la
   * pestaña que acababa de abrir, y cargaba el PDF en la pestaña
   * ORIGINAL. La persona veía una pestaña `about:blank` huérfana que
   * nunca se llenaba.
   */
  const codigo = leer("src/utils/descargarArchivo.ts");
  const verArchivo = codigo.slice(codigo.indexOf("export async function verArchivo"));

  it("no pide noopener en el window.open cuya referencia necesita", () => {
    const apertura = verArchivo.match(/window\.open\((.*?)\);/s)?.[1] ?? "";
    expect(apertura).not.toContain("noopener");
  });

  it("pero sigue anulando opener, que es lo que noopener protegía", () => {
    // Quitar noopener sin esto dejaría a la pestaña nueva tocando la
    // original: se cambiaría un fallo visible por uno de seguridad.
    expect(verArchivo).toContain("ventana.opener = null");
  });

  it("comprueba que la ventana existe antes de usarla", () => {
    // Si el navegador bloquea la pestaña emergente, window.open devuelve
    // null igual. Sin esta guarda, el fallo vuelve por otra puerta.
    expect(verArchivo).toMatch(/if \(ventana && !ventana\.closed\)/);
    expect(verArchivo).toContain("window.location.href = urlLocal");
  });
});

describe("nombre del PDF de factura", () => {
  const codigo = leer("src/components/FacturaCard.tsx");
  const fn = codigo.slice(
    codigo.indexOf("function nombreArchivoFactura"),
    codigo.indexOf("function nombreArchivoFactura") + 700,
  );

  it("usa la fecha de emisión, igual que el reporte", () => {
    // "Factura 05 Ago 2026.pdf" junto a "Reporte 05 Ago 2026.pdf": en la
    // misma carpeta se ordenan y se reconocen igual.
    expect(fn).toContain("fechaDeFactura(f.fecha_emision)");
    expect(fn).toContain("MESES_CORTOS[fecha.getMonth()]");
    expect(fn).toContain('padStart(2, "0")');
  });

  it("nunca produce un archivo llamado undefined", () => {
    // Las facturas sincronizadas del sistema externo pueden llegar sin
    // fecha de emisión.
    expect(fn).toContain('f.numero_fmt || f.serie || "Vista360"');
  });

  it("los dos botones y la firma usan el MISMO nombre", () => {
    // Antes "Ver" y "Descargar" mandaban cada uno el suyo.
    const usos = codigo.match(/nombreArchivoFactura\(f\)/g) ?? [];
    expect(usos.length).toBeGreaterThanOrEqual(4);
    expect(codigo).not.toMatch(/`\$\{f\.numero_fmt \|\| f\.serie \|\| "factura"\}\.pdf`/);
  });
});

describe("el nombre de descarga no puede inyectar cabeceras", () => {
  /**
   * El nombre lo elige el navegador y termina en
   * `attachment; filename="<aquí>"`. Unas comillas cierran el campo antes
   * de tiempo; un salto de línea abre una cabecera nueva.
   */
  it("quita comillas, saltos de línea y barras", () => {
    expect(nombreDescargaSeguro('a"; X-Malo: si')).toBe("a X-Malo si");
    expect(nombreDescargaSeguro("a\r\nX-Malo: si")).toBe("a X-Malo si");
    expect(nombreDescargaSeguro("../../otro")).toBe("....otro");
    expect(nombreDescargaSeguro("a/b\\c")).toBe("abc");
  });

  it("deja intacto un nombre normal", () => {
    // Si esto falla, la corrección rompe la funcionalidad que arregla.
    expect(nombreDescargaSeguro("Factura 05 Ago 2026.pdf")).toBe("Factura 05 Ago 2026.pdf");
    expect(nombreDescargaSeguro("Reporte 05 Ago 2026.pdf")).toBe("Reporte 05 Ago 2026.pdf");
    expect(nombreDescargaSeguro("Factura F001-123 (copia).pdf")).toBe("Factura F001-123 (copia).pdf");
  });

  it("acota el largo y nunca devuelve vacío", () => {
    expect(nombreDescargaSeguro("a".repeat(500)).length).toBeLessThanOrEqual(120);
    expect(nombreDescargaSeguro("///")).toBe("archivo");
    expect(nombreDescargaSeguro(undefined)).toBe("archivo");
    expect(nombreDescargaSeguro(123)).toBe("archivo");
  });

  it("se aplica en el ÚNICO sitio que arma la cabecera", () => {
    // Red de seguridad: si alguien arma otro Content-Disposition a mano,
    // se salta el filtro. Debe haber exactamente uno, y saneado.
    const r2 = leer("functions/src/r2Storage.ts");
    const armados = r2.match(/ResponseContentDisposition/g) ?? [];
    expect(armados.length).toBe(1);
    expect(r2).toContain("nombreDescargaSeguro(nombreDescarga)");
  });
});

describe("firmar la descarga cuesta lecturas: solo al pulsar", () => {
  /**
   * `firmarDescargaFactura` hace, para un CLIENTE, hasta tres lecturas de
   * Firestore antes de firmar nada: su ficha de portal, la factura por
   * pdfUrl, y el cliente por RUC.
   *
   * Estaba en un useEffect, así que cada tarjeta que aparecía en pantalla
   * la llamaba aunque nadie tocara "Descargar". Con 20 facturas eran 20
   * invocaciones y hasta 60 lecturas solo por abrir la pantalla.
   */
  const codigo = leer("src/components/FacturaCard.tsx");

  it("no se llama al pintar la tarjeta", () => {
    const efectos = codigo.match(/useEffect\(\(\) => \{[\s\S]*?\n  \}, \[/g) ?? [];
    const enEfecto = efectos.filter((e) => e.includes("firmarDescargaFactura"));
    expect(enEfecto).toEqual([]);
  });

  it("se llama desde el botón, y una sola vez", () => {
    expect(codigo).toContain("const pedirUrlDescarga = useCallback");
    expect(codigo).toContain("void pedirUrlDescarga()");
    // Si ya se pidió, no se vuelve a pedir: pulsar dos veces no cuesta el doble.
    expect(codigo).toContain("if (urlDescarga) return urlDescarga;");
  });

  it("si firmar falla, el botón sigue descargando", () => {
    // Nunca un botón muerto: peor nombre de archivo, pero descarga.
    const fn = codigo.slice(codigo.indexOf("const pedirUrlDescarga"), codigo.indexOf("}, [urlDescarga"));
    // Se mira DENTRO del catch, no en toda la función: `return urlVer` también
    // aparece en la salida temprana, así que buscarlo suelto daba por buena
    // una versión que relanzaba el error y dejaba el botón muerto.
    const catchBlock = fn.slice(fn.indexOf("} catch"), fn.indexOf("\n  }", fn.indexOf("} catch")));
    expect(catchBlock).toContain('return urlVer ?? ""');
    expect(catchBlock).not.toContain("throw");
  });

  it("la precarga del admin para COMPARTIR sigue siendo anticipada, y es correcto", () => {
    // navigator.share exige que la llamada ocurra dentro del gesto de la
    // persona. Si el archivo se pidiera al pulsar, el await perdería esa
    // activación y la hoja de compartir no abriría. Por eso esta SÍ va
    // por adelantado -- y solo para el admin.
    expect(codigo).toContain("precargarArchivoR2(urlVer, nombreArchivoFactura(f), controller.signal)");
    expect(codigo).toContain("if (!isAdmin || !urlVer) return;");
    expect(codigo).toContain('new IntersectionObserver');
  });
});

describe("la pestaña del visor lleva el nombre del documento", () => {
  /**
   * Navegar directo a la URL `blob:` funciona pero deja la pestaña
   * llamándose "untitled": un blob no lleva nombre, así que el visor de
   * Chrome no tiene de dónde sacarlo. Verificado en producción.
   */
  const codigo = leer("src/utils/descargarArchivo.ts");
  const fn = codigo.slice(codigo.indexOf("function mostrarPdfConTitulo"), codigo.indexOf("export async function verArchivo"));

  it("el PDF se muestra dentro de una página propia, con título", () => {
    expect(codigo).toContain("mostrarPdfConTitulo(ventana, urlLocal, _nombre)");
    expect(fn).toContain("<title>");
    expect(fn).toContain('type="application/pdf"');
  });

  it("el nombre se ESCAPA antes de meterlo en el HTML", () => {
    // Sale de datos (número o fecha de la factura) y se está armando
    // HTML: sin escapar, un nombre con < o " inyecta etiquetas.
    expect(fn).toContain('replace(/[&<>"\']/g');
    expect(fn).toContain("&lt;");
    expect(fn).toContain("&quot;");
  });

  it("si no se puede escribir en la pestaña, se sigue viendo el PDF", () => {
    // Perder el título es aceptable; perder el documento no.
    const bloqueCatch = fn.slice(fn.indexOf("} catch"));
    expect(bloqueCatch).toContain("ventana.location.href = urlLocal");
  });
});

describe("la hoja de compartir SOLO en iOS", () => {
  /**
   * COMPROBADO EN PRODUCCION, en una Mac.
   *
   * `descargarArchivo` usaba la hoja del sistema en cuanto el navegador
   * soportara `navigator.canShare` con archivos. El comentario decia "en
   * escritorio no existe esa hoja" -- y era falso: Chrome en macOS SI la
   * tiene. Pulsar "Descargar" abria el menu de compartir (AirDrop, Mail,
   * Mensajes) en vez de bajar el archivo, y esa hoja en macOS NO trae
   * "Guardar en Archivos": el boton se quedaba en "Descargando..." para
   * siempre y no habia forma de obtener el PDF.
   *
   * iOS es el unico sitio donde la descarga normal no funciona de verdad.
   */
  const codigo = leer("src/utils/descargarArchivo.ts");

  it("solo se usa la hoja si es iOS", () => {
    const fn = codigo.slice(codigo.indexOf("function puedeUsarLaHojaDelSistema"));
    expect(fn.slice(0, 200)).toContain("if (!esIOS()) return false;");
  });

  it("detecta tambien el iPad moderno, que se hace pasar por Mac", () => {
    const fn = codigo.slice(codigo.indexOf("function esIOS"), codigo.indexOf("function puedeUsarLaHojaDelSistema"));
    expect(fn).toContain("/iPhone|iPad|iPod/");
    expect(fn).toContain("maxTouchPoints");
    expect(fn).toContain("Macintosh");
  });

  it("una Mac de escritorio NO cuenta como iOS", () => {
    // La Mac tiene userAgent con "Macintosh" pero maxTouchPoints 0.
    const fn = codigo.slice(codigo.indexOf("function esIOS"), codigo.indexOf("function puedeUsarLaHojaDelSistema"));
    expect(fn).toMatch(/maxTouchPoints[^)]*\)?\s*(\?\?\s*0\s*\)?)?\s*>\s*1/);
  });
});

describe("un solo nombre por documento, venga por donde venga", () => {
  it("el reporte usa mesLabel, no el mes crudo", () => {
    // Habia TRES nombres para el mismo archivo: "Reporte 2026-08.pdf" al
    // descargar, "Reporte-17-Jun-2026.pdf" al compartir, y
    // "Reporte 05 Ago 2026.pdf" en la url firmada del servidor.
    const codigo = leer("src/components/ReportCard.tsx");
    expect(codigo).not.toContain('`Reporte ${informe.mes ?? ""}.pdf`');
    const usos = codigo.match(/nombreArchivoReporte\(informe\.mesLabel\)/g) ?? [];
    expect(usos.length).toBeGreaterThanOrEqual(3);
  });

  it("reporte y factura usan el MISMO formato", () => {
    // En la misma carpeta se ordenan y se reconocen igual.
    const rep = leer("src/components/ReportCard.tsx");
    const fac = leer("src/components/FacturaCard.tsx");
    expect(rep).toContain("return `Reporte ${limpio");
    expect(fac).toContain("return `Factura ${dia}");
    // Con espacios, no con guiones.
    expect(rep).not.toContain('`Reporte-${');
  });
});
