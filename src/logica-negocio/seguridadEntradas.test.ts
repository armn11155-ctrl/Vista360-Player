import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { esIdValido } from "../../functions/src/validaciones.js";

/**
 * MENTALIDAD DE ATACANTE: los identificadores que manda el navegador.
 *
 * Muchas funciones construyen rutas pegando un id que llega en la
 * petición:
 *
 *     db.doc(`clientes/${clienteId}`)
 *     `clientes/${clienteId}/reportes/${mes}/${dia}`   // key de R2
 *
 * Sin validar, ese id deja de ser un id y pasa a ser parte de la RUTA:
 *
 *  - Firestore: "abc/subcoleccion/otro" convierte `clientes/{id}` en
 *    `clientes/abc/subcoleccion/otro`, una ruta válida a otro sitio.
 *  - R2: "../../vista360/facturas" escapa de la carpeta de reportes. Ahí
 *    NO hay reglas de seguridad: el Admin SDK y las credenciales de R2
 *    pueden con todo.
 *
 * Hoy esas funciones exigen ser Gerente, así que el riesgo real es bajo.
 * Pero eso es una defensa PRESTADA: el día que una se abra a un
 * Trabajador --como ya pasó con las reglas de Firestore-- el agujero se
 * abre solo. Validar no depende de quién llame.
 */

const FUNCIONES = resolve(__dirname, "../../functions/src");
const leer = (f: string) => readFileSync(resolve(FUNCIONES, f), "utf-8");
const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

describe("los ids del navegador se validan antes de usarse en una ruta", () => {
  /** Funciones que reciben un id por `request.data` y lo meten en una ruta. */
  const CON_ID_EXTERNO = [
    "actualizarContrato.ts",
    "eliminarContrato.ts",
    "actualizarImagenCampania.ts",
    "actualizarNombreFactura.ts",
    "eliminarFactura.ts",
    "actualizarEstadoSolicitud.ts",
    "eliminarSolicitudCampana.ts",
    "actualizarClienteInfo.ts",
    "administrarClienteAdmin.ts",
    "eliminarReporteCliente.ts",
  ];

  for (const archivo of CON_ID_EXTERNO) {
    it(`${archivo} valida su id`, () => {
      expect(sinComentarios(leer(archivo))).toContain("exigirId(");
    });
  }

  it("NADIE coge un id de request.data sin pasarlo por exigirId", () => {
    // Red de seguridad para las funciones que se añadan mañana.
    const culpables: string[] = [];
    for (const archivo of readdirSync(FUNCIONES).filter((f) => f.endsWith(".ts"))) {
      const codigo = sinComentarios(leer(archivo));
      // `const xxxId = ...request.data...` sin exigirId en la misma línea.
      for (const m of codigo.matchAll(/const\s+(\w*[Ii]d)\s*=\s*([^\n;]*request\.data[^\n;]*);/g)) {
        if (!(m[2].includes("exigirId") || m[2].includes("idOpcional") || m[2].includes("resolverUid("))) culpables.push(`${archivo}: ${m[1]}`);
      }
    }
    expect(culpables).toEqual([]);
  });
});

describe("las keys de R2 que llegan del navegador se validan", () => {
  it("obtenerArchivoR2Base64 exige una carpeta conocida", () => {
    // Sin esto, cualquier ruta del bucket seria legible: el Admin SDK no
    // pasa por las reglas de Firestore ni por ninguna otra.
    expect(sinComentarios(leer("obtenerArchivoR2Base64.ts"))).toContain("esKeyValida(key)");
  });

  it("firmarUrlsR2 filtra ANTES de mirar la lista blanca", () => {
    // El orden importa: si se comprobara `startsWith("vista360/avatares/")`
    // sobre una key con ".." dentro, pasaría el filtro de carpeta y solo
    // después se resolvería la ruta real.
    const codigo = sinComentarios(leer("firmarUrlsR2.ts"));
    expect(codigo.indexOf("filter(esKeyValida)")).toBeLessThan(codigo.indexOf("keysPermitidas"));
  });

  it("esKeyValida rechaza '..', rutas absolutas y carpetas desconocidas", () => {
    const codigo = leer("r2Storage.ts");
    expect(codigo).toContain('key.includes("..")');
    expect(codigo).toContain('key.startsWith("/")');
    expect(codigo).toContain("CARPETAS_PERMITIDAS.some");
  });

  it("esKeyValida rechaza keys absurdamente largas y con bytes de control/nulos", () => {
    // Ninguna key real (las arma nuevaKey()) se acerca a esto -- el
    // único motivo para mandar una así es probar el límite del sistema
    // o esconder algo en bytes no imprimibles.
    const codigo = leer("r2Storage.ts");
    expect(codigo).toMatch(/LARGO_MAXIMO_KEY = \d+/);
    expect(codigo).toContain("key.length > LARGO_MAXIMO_KEY");
    expect(codigo).toMatch(/\\x00-\\x1f/);
  });
});

describe("el gasto tiene un techo aunque alguien abuse", () => {
  it("hay un tope global de instancias", () => {
    // Sin tope, un cliente AUTENTICADO llamando en bucle desde la consola
    // del navegador escala tan rápido como aguante Google. No hace falta
    // romper nada: basta con repetir una llamada legítima.
    const index = leer("index.ts");
    expect(index).toContain("setGlobalOptions(");
    const max = Number(/maxInstances:\s*(\d+)/.exec(index)![1]);
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(50);
  });

  it("el tope se aplica ANTES de exportar ninguna función", () => {
    // setGlobalOptions solo afecta a lo que se declara después.
    const index = leer("index.ts");
    expect(index.indexOf("setGlobalOptions(")).toBeLessThan(index.indexOf("export {"));
  });

  it("firmarUrlsR2 limita cuántas keys acepta por llamada", () => {
    // Hace una consulta a Firestore por cada factura pedida.
    expect(sinComentarios(leer("firmarUrlsR2.ts"))).toContain("MAX_KEYS_POR_LLAMADA");
  });
  it("idOpcional acepta vacio pero NUNCA una ruta", () => {
    // idOpcional existe porque hay campos opcionales de verdad (una
    // cotizacion sin panel). Lo que no puede es ser una puerta trasera:
    // "opcional" significa "puede no venir", no "puede venir con barras".
    const codigo = leer("identificadores.ts");
    expect(codigo).toContain("export function idOpcional");
    // Delega en exigirId; si alguien la reescribe para devolver el valor
    // tal cual, esta comprobacion cae.
    const cuerpo = codigo.slice(codigo.indexOf("export function idOpcional"));
    expect(cuerpo).toContain("return exigirId(id, nombreDelCampo);");
  });

  it("resolverUid valida el uid que manda el cliente", () => {
    // La red de seguridad de arriba deja pasar `await resolverUid(db,
    // request.data)` porque el uid sale de ahi ya validado. Esa exencion
    // solo es legitima mientras resolverUid valide de verdad: si alguien
    // le quita la validacion, la exencion se convierte en el agujero.
    const codigo = leer("administrarUsuarioPortal.ts");
    const inicio = codigo.indexOf("async function resolverUid");
    expect(inicio).toBeGreaterThan(-1);
    const cuerpo = codigo.slice(inicio, codigo.indexOf("\n}", inicio));
    expect(cuerpo).toContain('idOpcional(data.uid, "uid")');
    expect(cuerpo).not.toContain("limpiar(data.uid)");
  });

  it("ningun id externo llega a una ruta de Firestore o R2 sin validar", () => {
    // Lo que de verdad importa no es que exista exigirId, sino que no
    // quede ningun `db.doc(...)` ni Key de R2 armado con un id crudo.
    const dir = FUNCIONES;
    const culpables: string[] = [];
    for (const archivo of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      const codigo = leer(archivo);
      // Variables que vinieron de request.data SIN validador.
      const crudas = new Set<string>();
      for (const m of codigo.matchAll(/const\s+(\w+)\s*=\s*([^\n;]*request\.data[^\n;]*);/g)) {
        const v = m[2];
        if (!v.includes("exigirId") && !v.includes("idOpcional") && !v.includes("resolverUid(")) crudas.add(m[1]);
      }
      if (crudas.size === 0) continue;
      for (const m of codigo.matchAll(/(?:db\.doc\(|Key:\s*)`([^`]*)`/g)) {
        for (const t of m[1].matchAll(/\$\{(\w+)\}/g)) {
          if (crudas.has(t[1])) culpables.push(`${archivo}: ${t[1]} -> ${m[1]}`);
        }
      }
    }
    expect(culpables).toEqual([]);
  });

  // Las pruebas de arriba leen el codigo como texto. Eso comprueba que la
  // defensa siga escrita, no que funcione: cambiar el patron por uno que
  // acepte barras las pasa todas. Estas la EJECUTAN.
  const ATAQUES = [
    "../../vista360/facturas",   // salir del prefijo en R2
    "..",
    "a/b",                        // colarse a otro documento de Firestore
    "/etc/passwd",
    "clientes/otro/reportes",
    "%2e%2e%2f",                  // lo mismo, codificado
    "a\\b",
    "a b",
    "a\nb",
    "a.b",                        // el punto navega en rutas de objeto
    "*",
    "#hash",
    "?query=1",
    "a".repeat(129),              // documento gigante
    "",
  ];

  it("esIdValido RECHAZA de verdad todo lo que huela a ruta", () => {
    for (const ataque of ATAQUES) {
      expect(esIdValido(ataque), `deberia rechazar ${JSON.stringify(ataque)}`).toBe(false);
    }
  });

  it("esIdValido ACEPTA los identificadores reales de la aplicacion", () => {
    // Si esto falla, la validacion rompe la aplicacion en produccion.
    const reales = [
      "JR1khdwaRbRJEa3GfN57",              // id automatico de Firestore
      "empresa-a",                          // id con guion
      "JR1khdwaRbRJEa3GfN57_2026-08-05",   // informeId
      "aBc123",
      "a".repeat(128),                      // justo en el limite
    ];
    for (const id of reales) {
      expect(esIdValido(id), `deberia aceptar ${id}`).toBe(true);
    }
  });

  it("esIdValido no se traga tipos raros", () => {
    for (const raro of [null, undefined, 123, {}, [], true, { toString: () => "ok" }]) {
      expect(esIdValido(raro)).toBe(false);
    }
  });

  it("idOpcional solo perdona el vacio: el resto pasa por esIdValido", () => {
    // idOpcional no se puede EJECUTAR desde acá (importa HttpsError, que
    // rompería el despliegue de Cloudflare; ver validaciones.ts). Es un
    // envoltorio de dos líneas, así que se comprueba que solo trate
    // aparte el vacío y delegue todo lo demás.
    const codigo = leer("identificadores.ts");
    const cuerpo = codigo.slice(codigo.indexOf("export function idOpcional"));
    expect(cuerpo).toContain('if (id === undefined || id === null || id === "") return "";');
    expect(cuerpo).toContain("return exigirId(id, nombreDelCampo);");
  });

});
