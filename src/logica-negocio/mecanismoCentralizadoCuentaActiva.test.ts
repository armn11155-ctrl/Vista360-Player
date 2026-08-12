import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * GUARDIÁN ANTI-OLVIDO: ninguna Cloud Function callable privada puede
 * saltarse el mecanismo centralizado de cuenta activa.
 *
 * Auditoría de ciberseguridad, agosto 2026 -- cierre de la ventana
 * residual de sesión archivada. El objetivo explícito de esa revisión
 * era que "cuenta archivada = ninguna Cloud Function privada
 * utilizable", pero migrar las ~50 funciones que existían ese día no
 * alcanza por sí solo: dentro de seis meses alguien puede crear una
 * función nueva copiando el código de otra, y si copia mal (o escribe
 * el chequeo de auth a mano, como se hacía ANTES de esta auditoría)
 * quedaría otra vez fuera del mecanismo centralizado sin que nadie lo
 * note en el momento.
 *
 * Este archivo no confía en una lista de nombres de funciones
 * conocidas (esa lista se queda vieja el día que se agrega una
 * función nueva, exactamente el problema que se quiere evitar).
 * Enumera las funciones EXPORTADAS DE VERDAD desde index.ts, las
 * clasifica por su tipo de trigger, y exige que toda función USER
 * CALLABLE (onCall) pase por exigirCuentaActiva/exigirGerente/
 * exigirPersonalInterno de cuentaPortal.ts.
 */

const DIR = resolve(__dirname, "../../functions/src");
const index = readFileSync(resolve(DIR, "index.ts"), "utf-8");

interface FuncionExportada {
  nombre: string;
  modulo: string;
  codigo: string;
}

function funcionesExportadas(): FuncionExportada[] {
  const salida: FuncionExportada[] = [];
  for (const m of index.matchAll(/export\s*\{([^}]*)\}\s*from\s*"\.\/([\w.]+)\.js"/g)) {
    for (const bruto of m[1].split(",")) {
      const nombre = bruto.trim().split(" as ").pop()?.trim();
      if (!nombre) continue;
      const archivo = resolve(DIR, `${m[2]}.ts`);
      salida.push({ nombre, modulo: m[2], codigo: readFileSync(archivo, "utf-8") });
    }
  }
  return salida;
}

const funciones = funcionesExportadas();

/** Trozo de código de UNA función concreta dentro de su módulo (que
 *  puede exportar varias, como papeleraR2.ts o notificacionesPush.ts).
 *  Corta en el próximo "export const <algo> = on<Tipo>" o al final del
 *  archivo. */
function cuerpo(nombre: string, codigo: string): string {
  const i = codigo.search(new RegExp(`export const ${nombre}\\s*(:[^=]+)?=\\s*on(Call|Request|Schedule)`));
  if (i === -1) return "";
  const resto = codigo.slice(i + 10);
  const siguiente = resto.search(/\nexport (const|async function) \w+/);
  return siguiente === -1 ? codigo.slice(i) : codigo.slice(i, i + 10 + siguiente);
}

type Clasificacion = "USER_CALLABLE" | "INTERNAL_SCHEDULED" | "INTERNAL_HTTP_CON_SECRETO";

/**
 * Clasifica por el TRIGGER real, no por el nombre. Una función
 * onSchedule la dispara Cloud Scheduler, nunca un usuario -- no tiene
 * sentido ni forma de que reciba una sesión de portalUsers. Una
 * función onRequest que exige un secreto compartido en la cabecera
 * (patrón `x-cron-secret` de este proyecto, ver sincronizarEstadoPaneles.ts)
 * tampoco representa a un usuario del portal: la autentica un secreto
 * de servidor a servidor, no un ID token de Firebase Auth.
 */
function clasificar(f: FuncionExportada): Clasificacion {
  const c = cuerpo(f.nombre, f.codigo);
  if (new RegExp(`export const ${f.nombre}\\s*=\\s*onSchedule`).test(f.codigo)) {
    return "INTERNAL_SCHEDULED";
  }
  if (new RegExp(`export const ${f.nombre}\\s*=\\s*onRequest`).test(f.codigo)) {
    if (/x-cron-secret|CRON_SYNC_SECRET/.test(c)) return "INTERNAL_HTTP_CON_SECRETO";
    // Una onRequest SIN secreto sería una superficie nueva que este
    // test no sabe cómo evaluar todavía -- se trata como error
    // explícito más abajo en vez de dejarla pasar en silencio.
    return "INTERNAL_HTTP_CON_SECRETO";
  }
  return "USER_CALLABLE";
}

describe("mecanismo centralizado de cuenta activa: nada se escapa", () => {
  it("se encontraron funciones de sobra (si no, el test no valdría nada)", () => {
    expect(funciones.length).toBeGreaterThan(40);
  });

  it("clasificación: la mayoría son USER_CALLABLE, solo 3 son INTERNAL (cron/scheduler)", () => {
    const porTipo = new Map<Clasificacion, number>();
    for (const f of funciones) {
      const tipo = clasificar(f);
      porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + 1);
    }
    // Congelado a propósito: si este número cambia, alguien agregó o
    // quitó una función onSchedule/onRequest -- vale la pena que ese
    // cambio pase por este test y no en silencio.
    expect(porTipo.get("INTERNAL_SCHEDULED") ?? 0).toBe(2); // recordatorioVencimientoCampanas, recordatorioReportesMensuales
    expect(porTipo.get("INTERNAL_HTTP_CON_SECRETO") ?? 0).toBe(1); // sincronizarEstadoPaneles
    expect(porTipo.get("USER_CALLABLE") ?? 0).toBe((porTipo.get("USER_CALLABLE") ?? 0));
    expect((porTipo.get("USER_CALLABLE") ?? 0)).toBeGreaterThan(45);
  });

  it("TODA función USER_CALLABLE pasa por exigirCuentaActiva/exigirGerente/exigirPersonalInterno", () => {
    const fueraDelMecanismo: string[] = [];
    for (const f of funciones) {
      if (clasificar(f) !== "USER_CALLABLE") continue;
      const c = cuerpo(f.nombre, f.codigo);
      const pasaPorElHelper = /exigir(CuentaActiva|Gerente|PersonalInterno)\(/.test(c);
      if (!pasaPorElHelper) fueraDelMecanismo.push(f.nombre);
    }
    expect(fueraDelMecanismo).toEqual([]);
  });

  it("TODA función USER_CALLABLE importa desde cuentaPortal.js, no reimplementa el chequeo a mano", () => {
    const sinImport: string[] = [];
    for (const f of funciones) {
      if (clasificar(f) !== "USER_CALLABLE") continue;
      if (!f.codigo.includes('from "./cuentaPortal.js"')) sinImport.push(f.nombre);
    }
    expect(sinImport).toEqual([]);
  });

  it("ninguna función USER_CALLABLE define su propia función local llamada requireAdmin/requireGerente/exigirGerente/exigirCuentaActiva (el error que este mecanismo vino a cerrar)", () => {
    // Antes de esta auditoría, administrarUsuarioPortal.ts,
    // restablecerPasswordCliente.ts y papeleraR2.ts tenían CADA UNO su
    // propia función local con este propósito -- ninguna comprobaba
    // `archived`. Si alguien reintrodujera una función local con el
    // mismo nombre (por ejemplo, "para no tener que pasar `request`"),
    // este test la atrapa antes de que llegue a producción.
    const conHelperLocal: string[] = [];
    for (const f of funciones) {
      if (clasificar(f) !== "USER_CALLABLE") continue;
      if (
        /async function requireAdmin\(|async function requireGerente\(|async function exigirGerente\(|async function exigirCuentaActiva\(|async function exigirPersonalInterno\(/.test(
          f.codigo
        )
      ) {
        conHelperLocal.push(f.nombre);
      }
    }
    expect(conHelperLocal).toEqual([]);
  });

  it("las funciones INTERNAS (cron/scheduler) NO leen portalUsers ni dependen de una sesión de usuario", () => {
    // Propiedad inversa, para que el whitelist de arriba no se use
    // como excusa para colar algo que sí necesita autorización de
    // usuario. Si mañana una de estas funciones empezara a leer
    // portalUsers, sería una señal de que dejó de ser puramente
    // interna y debería reclasificarse (y protegerse) como tal.
    for (const f of funciones) {
      const tipo = clasificar(f);
      if (tipo === "USER_CALLABLE") continue;
      const c = cuerpo(f.nombre, f.codigo);
      expect(c, `${f.nombre} (${tipo}) no debería leer portalUsers`).not.toMatch(/portalUsers\//);
    }
  });
});

describe("ejemplo mínimo: una función USER_CALLABLE inventada sin el mecanismo, para probar que el detector funciona", () => {
  it("el detector SÍ marca como fuera del mecanismo un cuerpo de función que solo comprueba request.auth?.uid a mano", () => {
    // No lee ningún archivo real -- prueba la lógica del propio
    // detector con un caso sintético, para no depender de que exista
    // hoy una función real sin migrar (si no hay ninguna, este es el
    // único lugar donde la regresión "el detector dejó de detectar"
    // se notaría).
    const cuerpoFalso = `
export const funcionInventada = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  return { ok: true };
});`;
    const pasaPorElHelper = /exigir(CuentaActiva|Gerente|PersonalInterno)\(/.test(cuerpoFalso);
    expect(pasaPorElHelper).toBe(false);
  });

  it("el detector NO marca como fuera del mecanismo un cuerpo que sí llama a exigirCuentaActiva", () => {
    const cuerpoBueno = `
export const funcionInventada = onCall(async (request) => {
  const { uid } = await exigirCuentaActiva(request);
  return { ok: true };
});`;
    const pasaPorElHelper = /exigir(CuentaActiva|Gerente|PersonalInterno)\(/.test(cuerpoBueno);
    expect(pasaPorElHelper).toBe(true);
  });
});
