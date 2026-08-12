import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Papelera/Recuperación en la app (ago-2026): el mecanismo de copiar a
 * `_papelera/` antes de borrar (ver papeleraR2.test.ts) ya estaba en
 * producción, pero recuperar un archivo exigía entrar al dashboard de
 * Cloudflare a mano -- algo que solo alguien con esas credenciales podía
 * hacer, y sin dejar rastro de quién restauró qué. Esto añade
 * `listarPapelera` y `restaurarDePapelera` (functions/src/papeleraR2.ts)
 * para hacerlo desde Vista360 Player, con permisos y auditoría.
 *
 * El riesgo real acá no es "¿alguien puede ver la papelera?" -- es
 * "¿puede el navegador decidir A DÓNDE se restaura un archivo?". Si
 * pudiera, cualquiera con la consola abierta podría pedir "restaura esto
 * encima de la carpeta que yo diga" y sobrescribir el archivo de otro
 * cliente. Por eso la ruta de destino NUNCA viaja como campo aparte:
 * sale siempre de restarle el prefijo "_papelera/" a la propia key que
 * ya estaba en la papelera, y esa ruta se vuelve a validar contra las
 * carpetas conocidas antes de escribir nada.
 *
 * Mismo patrón whitebox que el resto del repo: se lee el archivo fuente
 * real (no una copia) y se comprueba el código que corre en producción.
 * Las funciones puras de validación de rutas se reimplementan tal cual
 * están en r2Storage.ts para poder EJECUTARLAS con casos concretos
 * (key manipulada, path traversal, carpeta no permitida...), en vez de
 * solo comprobar que el patrón de texto existe.
 */

const FUNCIONES = resolve(__dirname, "../../functions/src");

function leer(archivo: string): string {
  return readFileSync(resolve(FUNCIONES, archivo), "utf-8");
}

const r2Storage = leer("r2Storage.ts");
const papeleraR2 = leer("papeleraR2.ts");
const cuentaPortal = leer("cuentaPortal.ts");
const indexTs = leer("index.ts");

// ---------------------------------------------------------------------
// Reimplementación fiel de las funciones puras de r2Storage.ts, para
// ejecutarlas de verdad con entradas maliciosas/reales.
// ---------------------------------------------------------------------
const PAPELERA_PREFIJO = "_papelera/";
const CARPETAS_PERMITIDAS = ["vista360/campanas", "vista360/avatares", "vista360/facturas"];

function esKeyValida(key: string): boolean {
  if (!key || key.includes("..") || key.startsWith("/")) return false;
  return CARPETAS_PERMITIDAS.some((folder) => key.startsWith(`${folder}/`));
}

function esClavePapelera(key: unknown): key is string {
  return typeof key === "string" && key.startsWith(PAPELERA_PREFIJO) && key.length > PAPELERA_PREFIJO.length;
}

function rutaOriginalDesdeClavePapelera(clavePapelera: string): string {
  return clavePapelera.slice(PAPELERA_PREFIJO.length);
}

const FORMATO_REPORTE_CLIENTE =
  /^clientes\/([A-Za-z0-9_-]{1,128})\/reportes\/(\d{4}-\d{2})\/(\d{2})\/[A-Za-z0-9_-]{1,60}\.pdf$/;

function datosRutaReporte(rutaOriginal: string): { clienteId: string; mes: string; dia: string } | null {
  const m = FORMATO_REPORTE_CLIENTE.exec(rutaOriginal);
  if (!m) return null;
  return { clienteId: m[1], mes: m[2], dia: m[3] };
}

function esRutaOriginalPermitida(rutaOriginal: string): boolean {
  if (esKeyValida(rutaOriginal)) return true;
  return datosRutaReporte(rutaOriginal) !== null;
}

describe("r2Storage.ts: las funciones puras reimplementadas coinciden con el código real", () => {
  it("exporta keyEnPapelera, esClavePapelera y rutaOriginalDesdeClavePapelera", () => {
    expect(r2Storage).toContain("export function keyEnPapelera(key: string): string {");
    expect(r2Storage).toContain("export function esClavePapelera(key: unknown): key is string {");
    expect(r2Storage).toContain("export function rutaOriginalDesdeClavePapelera(clavePapelera: string): string {");
  });

  it("esClavePapelera exige el prefijo Y que sobre algo detrás (no acepta el prefijo solo)", () => {
    expect(r2Storage).toContain('key.startsWith(PAPELERA_PREFIJO) && key.length > PAPELERA_PREFIJO.length');
  });

  it("rutaOriginalDesdeClavePapelera es una resta pura del prefijo, no reconstruye nada del navegador", () => {
    expect(r2Storage).toContain("return clavePapelera.slice(PAPELERA_PREFIJO.length);");
  });

  it("exporta esRutaOriginalPermitida, que combina esKeyValida y el formato de reportes", () => {
    expect(r2Storage).toContain("export function esRutaOriginalPermitida(rutaOriginal: string): boolean {");
    expect(r2Storage).toContain("if (esKeyValida(rutaOriginal)) return true;");
  });
});

// ---------------------------------------------------------------------
// 1. Validación de identidad de la key de papelera (defensa contra
//    "key manipulada").
// ---------------------------------------------------------------------
describe("PRUEBA: key manipulada", () => {
  it("rechaza una key que no empieza con _papelera/", () => {
    expect(esClavePapelera("vista360/facturas/x.pdf")).toBe(false);
  });

  it("rechaza el prefijo vacío (_papelera/ solo, sin nada detrás)", () => {
    expect(esClavePapelera("_papelera/")).toBe(false);
  });

  it("rechaza valores que no son string (undefined, null, número, objeto)", () => {
    expect(esClavePapelera(undefined)).toBe(false);
    expect(esClavePapelera(null)).toBe(false);
    expect(esClavePapelera(123)).toBe(false);
    expect(esClavePapelera({ clave: "_papelera/x" })).toBe(false);
  });

  it("acepta una key real de papelera", () => {
    expect(esClavePapelera("_papelera/vista360/facturas/172-abc.pdf")).toBe(true);
  });
});

// ---------------------------------------------------------------------
// 2. Path traversal, incluso pasando la primera comprobación (prefijo
//    correcto) -- la ruta original derivada tiene que seguir siendo
//    validada.
// ---------------------------------------------------------------------
describe("PRUEBA: path traversal", () => {
  it("una key con .. después del prefijo se rechaza al validar la ruta original", () => {
    const clave = "_papelera/vista360/facturas/../../../etc/passwd";
    expect(esClavePapelera(clave)).toBe(true); // pasa la primera comprobación (prefijo)
    const ruta = rutaOriginalDesdeClavePapelera(clave);
    expect(esRutaOriginalPermitida(ruta)).toBe(false); // pero se frena acá
  });

  it("_papelera/../vista360/facturas/x.pdf tampoco cuela: la ruta resultante contiene ..", () => {
    const clave = "_papelera/../vista360/facturas/x.pdf";
    const ruta = rutaOriginalDesdeClavePapelera(clave);
    expect(ruta).toContain("..");
    expect(esRutaOriginalPermitida(ruta)).toBe(false);
  });

  it("una ruta original que empieza con / también se rechaza", () => {
    expect(esRutaOriginalPermitida("/etc/passwd")).toBe(false);
  });
});

// ---------------------------------------------------------------------
// 3. Destino fuera de una carpeta permitida.
// ---------------------------------------------------------------------
describe("PRUEBA: destino fuera de carpeta permitida", () => {
  it("una ruta original en una carpeta desconocida se rechaza", () => {
    expect(esRutaOriginalPermitida("otra-carpeta/archivo.txt")).toBe(false);
  });

  it("_papelera/ dentro de la propia ruta original se rechaza (no se puede restaurar DENTRO de la papelera)", () => {
    expect(esRutaOriginalPermitida("_papelera/vista360/facturas/x.pdf")).toBe(false);
  });

  it("acepta las tres carpetas normales de subida", () => {
    expect(esRutaOriginalPermitida("vista360/facturas/x.pdf")).toBe(true);
    expect(esRutaOriginalPermitida("vista360/campanas/x.jpg")).toBe(true);
    expect(esRutaOriginalPermitida("vista360/avatares/x.jpg")).toBe(true);
  });

  it("acepta la carpeta de reportes de cliente y extrae clienteId/mes/dia", () => {
    const ruta = "clientes/cliente123/reportes/2026-08/05/reporte-digital.pdf";
    expect(esRutaOriginalPermitida(ruta)).toBe(true);
    expect(datosRutaReporte(ruta)).toEqual({ clienteId: "cliente123", mes: "2026-08", dia: "05" });
  });
});

// ---------------------------------------------------------------------
// 4. Restauración válida: la secuencia completa de la Cloud Function.
// ---------------------------------------------------------------------
describe("PRUEBA: restauración válida (flujo completo de restaurarDePapelera)", () => {
  it("valida sesión, exige Gerente, valida key, deriva ruta, valida carpeta, copia, verifica y audita -- en ese orden", () => {
    const idxGerente = papeleraR2.indexOf('const cuenta = await exigirGerente(request, "Solo la cuenta admin puede usar la papelera.");');
    const idxClave = papeleraR2.indexOf("if (!esClavePapelera(clavePapelera))");
    const idxRuta = papeleraR2.indexOf("rutaOriginalDesdeClavePapelera(clavePapelera)");
    const idxPermitida = papeleraR2.indexOf("if (!esRutaOriginalPermitida(rutaOriginal))");
    const idxRestaurar = papeleraR2.indexOf("await restaurarObjetoR2(rutaOriginal)");
    const idxAuditar = papeleraR2.indexOf('auditar("archivo_restaurado_papelera"');

    for (const idx of [idxGerente, idxClave, idxRuta, idxPermitida, idxRestaurar, idxAuditar]) {
      expect(idx).toBeGreaterThan(-1);
    }
    expect(idxClave).toBeGreaterThan(idxGerente);
    expect(idxRuta).toBeGreaterThan(idxClave);
    expect(idxPermitida).toBeGreaterThan(idxRuta);
    expect(idxRestaurar).toBeGreaterThan(idxPermitida);
    expect(idxAuditar).toBeGreaterThan(idxRestaurar);
  });

  it("restaurarObjetoR2 copia de _papelera/{ruta} a {ruta} con CopyObjectCommand", () => {
    expect(r2Storage).toMatch(/Key: rutaOriginal,\s*\n\s*CopySource: `\$\{bucket\}\/\$\{encodeURIComponent\(clavePapelera\)/);
  });

  it("restaurarObjetoR2 verifica con HeadObject que la copia quedó en la ruta original antes de devolver éxito", () => {
    const cuerpo = r2Storage.slice(r2Storage.indexOf("export async function restaurarObjetoR2"));
    const idxCopy = cuerpo.indexOf("new CopyObjectCommand(");
    const idxVerificacion = cuerpo.indexOf("new HeadObjectCommand({ Bucket: bucket, Key: rutaOriginal })", idxCopy);
    expect(idxCopy).toBeGreaterThan(-1);
    expect(idxVerificacion).toBeGreaterThan(idxCopy);
  });
});

// ---------------------------------------------------------------------
// 5. El navegador nunca controla el destino.
// ---------------------------------------------------------------------
describe("SEGURIDAD DURA: la ruta de destino nunca sale del navegador", () => {
  it("restaurarDePapelera solo lee request.data?.clave -- ningún otro campo de request.data", () => {
    const lecturasDeRequestData = papeleraR2.match(/request\.data\?\.[a-zA-Z0-9_]+/g) ?? [];
    const camposUnicos = new Set(lecturasDeRequestData);
    expect(camposUnicos).toEqual(new Set(["request.data?.clave"]));
  });

  it("no existe ningún campo rutaDestino/destino/rutaOriginal aceptado desde el cliente", () => {
    expect(papeleraR2).not.toMatch(/request\.data\?\.(ruta|destino|rutaDestino|rutaOriginal|path)/i);
  });

  it("en restaurarDePapelera, rutaOriginal se asigna SIEMPRE desde rutaOriginalDesdeClavePapelera(clavePapelera), nunca desde otra fuente", () => {
    const cuerpoRestaurar = papeleraR2.slice(papeleraR2.indexOf("export const restaurarDePapelera"));
    const asignacion = cuerpoRestaurar.match(/const rutaOriginal = [^;]+;/)?.[0] ?? "";
    expect(asignacion).toContain("rutaOriginalDesdeClavePapelera(clavePapelera)");
  });
});

// ---------------------------------------------------------------------
// 6. Archivo inexistente / restauración duplicada / no sobrescribir.
// ---------------------------------------------------------------------
describe("PRUEBA: archivo inexistente y restauración duplicada", () => {
  const cuerpoRestaurar = r2Storage.slice(
    r2Storage.indexOf("export async function restaurarObjetoR2"),
    r2Storage.indexOf("/** Genera una key segura")
  );

  it('si la ruta original YA tiene un objeto, se rechaza con "failed-precondition" en vez de sobrescribir', () => {
    expect(cuerpoRestaurar).toContain('new HeadObjectCommand({ Bucket: bucket, Key: rutaOriginal })');
    expect(cuerpoRestaurar).toMatch(/yaExiste[\s\S]*?"failed-precondition"/);
  });

  it("esa comprobación de sobrescritura ocurre ANTES de copiar (no después)", () => {
    const idxYaExiste = cuerpoRestaurar.indexOf("yaExiste");
    const idxCopy = cuerpoRestaurar.indexOf("new CopyObjectCommand(");
    expect(idxYaExiste).toBeGreaterThan(-1);
    expect(idxCopy).toBeGreaterThan(idxYaExiste);
  });

  it('si la key ya no está en la papelera (borrada/expirada), se responde "not-found" con mensaje claro', () => {
    expect(cuerpoRestaurar).toContain('"not-found"');
    expect(cuerpoRestaurar).toContain("Ese archivo ya no está en la papelera");
  });

  it("una segunda restauración del mismo archivo se comporta como restauración duplicada: la primera deja algo en rutaOriginal, así que la segunda cae en la rama de yaExiste", () => {
    // Esto documenta el comportamiento esperado end-to-end: no es una
    // llamada real a R2 (no hay credenciales en los tests), pero fija
    // que restaurarObjetoR2 SIEMPRE comprueba el destino antes de
    // escribir, así que dos restauraciones seguidas de la misma key no
    // pueden silenciosamente "tener éxito" las dos.
    expect(cuerpoRestaurar.indexOf("yaExiste")).toBeGreaterThan(-1);
  });
});

// ---------------------------------------------------------------------
// 7. La copia en la papelera NO se borra tras restaurar.
// ---------------------------------------------------------------------
describe("la copia en _papelera/ se conserva tras restaurar (no se borra)", () => {
  it("restaurarObjetoR2 no llama a DeleteObjectCommand", () => {
    const cuerpo = r2Storage.slice(
      r2Storage.indexOf("export async function restaurarObjetoR2"),
      r2Storage.indexOf("/** Genera una key segura")
    );
    expect(cuerpo).not.toContain("DeleteObjectCommand");
  });

  it("restaurarDePapelera tampoco borra la copia de la papelera", () => {
    expect(papeleraR2).not.toContain("DeleteObjectCommand");
    expect(papeleraR2).not.toContain("borrarObjetoR2");
  });
});

// ---------------------------------------------------------------------
// 8. Permisos: Gerente sí, Trabajador no, Cliente no, llamada directa
//    denegada.
// ---------------------------------------------------------------------
describe("PRUEBA: permisos -- Gerente puede, Trabajador y Cliente no pueden", () => {
  // Desde la auditoría de agosto 2026 (cierre de la ventana residual de
  // sesión archivada), papeleraR2.ts ya NO tiene su propia función
  // exigirGerente(uid, db) local -- pasa por el helper centralizado de
  // cuentaPortal.ts, el mismo que usan las otras ~50 Cloud Functions
  // callable. Este bloque comprueba dos cosas separadas: que papeleraR2
  // de verdad LLAMA al helper compartido (acá abajo), y que ESE helper
  // sigue cumpliendo las mismas garantías que antes tenía la función
  // local (ver cuentaPortal.test.ts para la batería completa).

  it("listarPapelera y restaurarDePapelera comparten la misma función exigirGerente del helper centralizado", () => {
    const usosListar = papeleraR2.indexOf("export const listarPapelera");
    const usosRestaurar = papeleraR2.indexOf("export const restaurarDePapelera");
    const cuerpoListar = papeleraR2.slice(usosListar, usosRestaurar);
    const cuerpoRestaurar = papeleraR2.slice(usosRestaurar);
    expect(cuerpoListar).toContain("await exigirGerente(request,");
    expect(cuerpoRestaurar).toContain("await exigirGerente(request,");
    expect(papeleraR2).toContain('import { exigirGerente } from "./cuentaPortal.js";');
    // Ya no queda ninguna función local con el mismo nombre en este
    // archivo -- si alguien la reintrodujera "por las dudas", este test
    // lo atrapa (una única exigirGerente en todo el archivo: el import).
    expect(papeleraR2).not.toContain("async function exigirGerente");
  });

  it("exigirGerente (cuentaPortal.ts) usa esGerente() -- NO esPersonalInterno() (ese error ya pasó una vez en producción con Analítica, ver menuPorRol.test.ts)", () => {
    const cuerpo = cuentaPortal.slice(
      cuentaPortal.indexOf("export async function exigirGerente"),
      cuentaPortal.indexOf("export async function exigirPersonalInterno")
    );
    expect(cuerpo).toContain("esGerente(cuenta.role)");
    expect(cuerpo).not.toContain("esPersonalInterno");
  });

  it("cuentaPortal.ts importa esGerente desde rolesInternos.js, la fuente única de verdad de qué es un Gerente", () => {
    expect(cuentaPortal).toContain('import { esGerente, esPersonalInterno } from "./rolesInternos.js";');
  });

  it("exigirCuentaActiva (de la que depende exigirGerente) corta ANTES de tocar R2 o Firestore más allá de leer el propio rol", () => {
    const cuerpo = cuentaPortal.slice(
      cuentaPortal.indexOf("export async function exigirCuentaActiva"),
      cuentaPortal.indexOf("export async function exigirGerente")
    );
    // Solo una lectura a portalUsers/{uid} -- nada de R2 ni de otras
    // colecciones antes de decidir si continúa.
    expect(cuerpo).toContain("portalUsers/${uid}");
    expect(cuerpo.match(/\.doc\(|\.collection\(/g)?.length).toBe(1);
  });

  it("el rol se lee del propio documento de Firestore del uid autenticado, nunca de request.data (una llamada directa no puede declararse Gerente)", () => {
    const cuerpo = cuentaPortal.slice(
      cuentaPortal.indexOf("export async function exigirCuentaActiva"),
      cuentaPortal.indexOf("export async function exigirGerente")
    );
    expect(cuerpo).not.toContain("request.data");
    expect(cuerpo).toContain("data.role");
  });

  it("sin uid autenticado (llamada directa a la Cloud Function sin sesión) se rechaza con unauthenticated", () => {
    expect(cuentaPortal).toContain('throw new HttpsError("unauthenticated", "Debes iniciar sesión.");');
  });

  it("una cuenta ARCHIVADA no puede usar la papelera, aunque su token todavía sea válido", () => {
    // Esta garantía es justo la que NO existía antes de la auditoría de
    // cierre de ventana residual: exigirCuentaActiva (de la que depende
    // exigirGerente, y por tanto listarPapelera/restaurarDePapelera)
    // ahora rechaza cualquier cuenta con archived === true.
    const cuerpo = cuentaPortal.slice(
      cuentaPortal.indexOf("export async function exigirCuentaActiva"),
      cuentaPortal.indexOf("export async function exigirGerente")
    );
    expect(cuerpo).toContain("data.archived === true");
  });
});

// ---------------------------------------------------------------------
// 9. Auditoría.
// ---------------------------------------------------------------------
describe("PRUEBA: registro de auditoría", () => {
  it("registro.ts declara archivo_restaurado_papelera en el tipo cerrado EventoAuditable", () => {
    const registro = leer("registro.ts");
    expect(registro).toMatch(/EventoAuditable\s*=[\s\S]*"archivo_restaurado_papelera"/);
  });

  it("importa auditar y auditarFallo desde registro.js", () => {
    expect(papeleraR2).toMatch(/import\s*\{\s*auditar,\s*auditarFallo\s*\}\s*from\s*"\.\/registro\.js"/);
  });

  it('registra "archivo_restaurado_papelera" con uid, rol, objetivoId (la ruta), tipo y clienteId al restaurar con éxito', () => {
    const llamada = papeleraR2.match(/auditar\("archivo_restaurado_papelera",\s*\{[\s\S]*?\}\);/)?.[0] ?? "";
    expect(llamada).toContain("uid");
    expect(llamada).toContain("rol");
    expect(llamada).toContain("objetivoId: rutaOriginal");
    expect(llamada).toContain("clienteId");
    expect(llamada).toContain("tipo: clasificacion.tipo");
  });

  it('registra el fallo con auditarFallo("archivo_restaurado_papelera", ...) si algo se cae', () => {
    expect(papeleraR2).toContain('auditarFallo("archivo_restaurado_papelera"');
  });

  it("el registro de éxito ocurre DESPUÉS de restaurarObjetoR2, no antes (solo se audita lo que de verdad pasó)", () => {
    const idxRestaurar = papeleraR2.indexOf("await restaurarObjetoR2(rutaOriginal)");
    const idxAuditar = papeleraR2.indexOf('auditar("archivo_restaurado_papelera"');
    expect(idxAuditar).toBeGreaterThan(idxRestaurar);
  });
});

// ---------------------------------------------------------------------
// 10. Recurso relacionado ya no existe en Firestore -> aviso obligatorio.
// ---------------------------------------------------------------------
describe("PRUEBA: el recurso de Firestore relacionado ya no existe", () => {
  it('define el mensaje exacto "Este elemento requiere recuperación adicional de datos."', () => {
    expect(papeleraR2).toContain(
      'const MENSAJE_RECUPERACION_ADICIONAL = "Este elemento requiere recuperación adicional de datos.";'
    );
  });

  it("evaluarEstadoDelRecurso marca requiereRecuperacionAdicional=true para Factura cuando la consulta a facturas viene vacía", () => {
    const cuerpo = papeleraR2.slice(
      papeleraR2.indexOf('case "Factura": {'),
      papeleraR2.indexOf('case "Foto de campaña": {')
    );
    expect(cuerpo).toMatch(/if \(q\.empty\) return \{ clienteId: null, requiereRecuperacionAdicional: true \};/);
  });

  it("evaluarEstadoDelRecurso marca requiereRecuperacionAdicional=true para Foto de campaña cuando no hay contrato NI solicitud viva", () => {
    const cuerpo = papeleraR2.slice(
      papeleraR2.indexOf('case "Foto de campaña": {'),
      papeleraR2.indexOf('case "Avatar de cliente": {')
    );
    expect(cuerpo).toContain("if (!encontrado) return { clienteId: null, requiereRecuperacionAdicional: true };");
  });

  it("evaluarEstadoDelRecurso marca requiereRecuperacionAdicional=true para Reporte de cliente cuando el documento informesCliente no existe", () => {
    const cuerpo = papeleraR2.slice(
      papeleraR2.indexOf('case "Reporte de cliente": {'),
      papeleraR2.indexOf("default:")
    );
    expect(cuerpo).toContain("requiereRecuperacionAdicional: !snap.exists");
  });

  it("un tipo no reconocido (default) también dispara el aviso -- nunca se asume que sí se puede recuperar del todo", () => {
    const cuerpo = papeleraR2.slice(papeleraR2.indexOf("default:"), papeleraR2.indexOf("}\n}\n\n/**\n * Lista"));
    expect(cuerpo).toContain("requiereRecuperacionAdicional: true");
  });

  it("restaurarDePapelera devuelve requiereRecuperacionAdicional y mensajeAdicional en la respuesta al navegador", () => {
    const cuerpo = papeleraR2.slice(papeleraR2.indexOf("export const restaurarDePapelera"));
    expect(cuerpo).toContain("requiereRecuperacionAdicional,");
    expect(cuerpo).toContain("mensajeAdicional: requiereRecuperacionAdicional ? MENSAJE_RECUPERACION_ADICIONAL : null,");
  });

  it("un reemplazo (avatar/imagen de campaña, no borrado completo) NO exige recuperación adicional cuando el documento sigue existiendo", () => {
    const cuerpo = papeleraR2.slice(
      papeleraR2.indexOf('case "Avatar de cliente": {'),
      papeleraR2.indexOf('case "Reporte de cliente": {')
    );
    expect(cuerpo).toContain("requiereRecuperacionAdicional: false");
  });
});

// ---------------------------------------------------------------------
// 11. No hay "eliminar definitivamente" -- se apoya en el lifecycle de
//     Cloudflare, como pidió explícitamente el usuario.
// ---------------------------------------------------------------------
describe("no existe un botón/endpoint de eliminar definitivamente desde la papelera", () => {
  it("papeleraR2.ts no exporta ninguna función de borrado -- solo listar y restaurar", () => {
    const exportadas = papeleraR2.match(/export const \w+/g) ?? [];
    expect(exportadas.sort()).toEqual(["export const listarPapelera", "export const restaurarDePapelera"].sort());
  });

  it("index.ts exporta ambas funciones desde papeleraR2.js", () => {
    expect(indexTs).toContain('export { listarPapelera, restaurarDePapelera } from "./papeleraR2.js";');
  });
});

// ---------------------------------------------------------------------
// 12. Lista para el navegador: no se expone la key cruda como CONTROL
//     editable -- ver diseño del componente en el frontend.
// ---------------------------------------------------------------------
describe("listarPapelera devuelve datos legibles para la tabla del Gerente", () => {
  const cuerpo = papeleraR2.slice(papeleraR2.indexOf("export const listarPapelera"));

  it("incluye tipo, ruta original, cliente relacionado, fecha de borrado, tamaño y días restantes", () => {
    for (const campo of ["tipo:", "rutaOriginal,", "clienteId,", "eliminadoEl,", "tamanoBytes:", "diasRestantes,"]) {
      expect(cuerpo).toContain(campo);
    }
  });

  it("marca restaurable=false para rutas que no pasan esRutaOriginalPermitida (defensa por si aparece algo fuera de lo conocido)", () => {
    expect(cuerpo).toContain("restaurable: permitida,");
  });
});
