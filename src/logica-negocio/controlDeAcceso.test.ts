import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Pruebas escritas desde la perspectiva de un ATACANTE.
 *
 * Modelo de amenaza: alguien con una cuenta de CLIENTE legítima (el
 * privilegio más bajo) abre la consola del navegador y llama
 * directamente a las Cloud Functions con argumentos manipulados,
 * saltándose por completo la interfaz. Las 56 funciones son endpoints
 * HTTPS públicos: la interfaz no protege nada, solo lo hace el código
 * del servidor.
 *
 * Estos tests no ejecutan las funciones (haría falta un emulador), pero
 * sí impiden que se pierdan las defensas que ya tienen, que es como
 * aparecen los agujeros: alguien añade una función nueva copiando otra y
 * olvida la comprobación, o relaja una que ya estaba.
 */

const DIR = resolve(__dirname, "../../functions/src");
const index = readFileSync(resolve(DIR, "index.ts"), "utf-8");

/** Nombre de función exportada -> código del módulo que la define. */
function funcionesExportadas(): Array<{ nombre: string; modulo: string; codigo: string }> {
  const salida: Array<{ nombre: string; modulo: string; codigo: string }> = [];
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

/** Trozo de código de una función concreta dentro de su módulo. */
function cuerpo(nombre: string, codigo: string): string {
  const i = codigo.search(new RegExp(`export const ${nombre}\\s*=\\s*on(Call|Request)`));
  if (i === -1) return "";
  const resto = codigo.slice(i + 10);
  const siguiente = resto.search(/\nexport const \w+\s*=\s*on(Call|Request)/);
  return siguiente === -1 ? codigo.slice(i) : codigo.slice(i, i + 10 + siguiente);
}

describe("superficie de ataque: las Cloud Functions son endpoints públicos", () => {
  it("se encontraron las funciones exportadas (si no, el test no valdría nada)", () => {
    expect(funciones.length).toBeGreaterThan(40);
  });

  it("TODA función comprueba la sesión, salvo la del cron (protegida por secreto)", () => {
    const sinComprobar: string[] = [];
    for (const f of funciones) {
      const c = cuerpo(f.nombre, f.codigo);
      if (!c) continue;
      const compruebaSesion = /request\.auth\?\.uid|request\.auth\.uid/.test(c);
      // sincronizarEstadoPaneles es onRequest (la llama el cron de
      // GitHub Actions, que no tiene sesión de Firebase) y se protege
      // con un secreto compartido en la cabecera.
      const esCron = /x-cron-secret/.test(c);
      if (!compruebaSesion && !esCron) sinComprobar.push(f.nombre);
    }
    expect(sinComprobar).toEqual([]);
  });

  it("la función del cron sigue exigiendo su secreto y rechazando GET", () => {
    const sync = readFileSync(resolve(DIR, "sincronizarEstadoPaneles.ts"), "utf-8");
    expect(sync).toContain('req.get("x-cron-secret") !== process.env.CRON_SYNC_SECRET');
    expect(sync).toContain('res.status(401)');
    expect(sync).toContain('req.method !== "POST"');
  });

  it("el ROL se lee SIEMPRE del servidor, nunca de lo que manda el cliente", () => {
    // Si una función confiara en un role/esAdmin llegado en request.data,
    // bastaría con mandarlo a mano desde la consola.
    for (const f of funciones) {
      const c = cuerpo(f.nombre, f.codigo);
      expect(c).not.toMatch(/request\.data[^;]{0,40}\.(role|esAdmin|esGerente|isAdmin)/);
    }
  });

  it("ninguna función decide permisos con datos del cliente en vez de portalUsers", () => {
    // El patrón correcto es leer portalUsers/{uid} del servidor.
    const conRol = funciones.filter((f) => /role|esGerente|esTrabajador|esPersonalInterno/.test(cuerpo(f.nombre, f.codigo)));
    expect(conRol.length).toBeGreaterThan(20);
    for (const f of conRol) {
      const c = cuerpo(f.nombre, f.codigo);
      const leeDelServidor =
        /portalUsers\/\$\{uid\}/.test(c) ||
        /requireAdmin|requireGerente|esPersonalInterno\(|esGerente\(|esTrabajador\(/.test(c) ||
        /portalUsers/.test(f.codigo);
      expect(leeDelServidor, `${f.nombre} decide permisos sin leer portalUsers`).toBe(true);
    }
  });
});

describe("IDOR: acceder a lo que no es tuyo", () => {
  const firmar = readFileSync(resolve(DIR, "firmarUrlsR2.ts"), "utf-8");

  it("firmarUrlsR2 decide por lista blanca, no firmando todo salvo excepciones", () => {
    // VULNERABILIDAD CORREGIDA: antes solo verificaba la propiedad de las
    // keys de facturas; cualquier otra se firmaba sin comprobar nada, así
    // que un cliente podía obtener una URL de las fotos de campaña de
    // otro con solo conocer su key.
    expect(firmar).toContain('key.startsWith("vista360/facturas/")');
    expect(firmar).toContain('key.startsWith("vista360/campanas/")');
    expect(firmar).toContain('key.startsWith("vista360/avatares/")');
    // Y lo que no encaje en ninguna carpeta conocida, se niega.
    expect(firmar).toMatch(/\/\/ Cualquier otra cosa: no\.\s*\n\s*return null;/);
  });

  it("firmarUrlsR2 comprueba que las fotos de campaña sean de SUS campañas", () => {
    expect(firmar).toContain("keysDeMisCampanas");
    expect(firmar).toContain('.where("cliente_id", "==", clienteIdPropio)');
  });

  it("firmarUrlsR2 limita cuántas keys se piden de una vez", () => {
    expect(firmar).toContain("MAX_KEYS_POR_LLAMADA");
  });

  it("las funciones que reciben clienteId comprueban que sea el del que llama", () => {
    for (const nombre of ["listarReportesCliente", "marcarReporteVisto"]) {
      const f = funciones.find((x) => x.nombre === nombre)!;
      const c = cuerpo(nombre, f.codigo);
      // Tiene que comparar el clienteId recibido contra el de portalUsers.
      expect(c, `${nombre} no compara clienteId contra el perfil`).toMatch(
        /clienteId\s*!==\s*clienteId|propioData\?\.clienteId\s*!==\s*clienteId|clienteId\s*!==\s*propioData/
      );
    }
  });

  it("marcarReporteVisto no deja meter barras en el id (rutas inventadas)", () => {
    const c = readFileSync(resolve(DIR, "marcarReporteVisto.ts"), "utf-8");
    expect(c).toContain("/^[A-Za-z0-9_-]+$/.test(informeId)");
  });

  it("las keys de R2 no admiten salto de carpeta ni rutas absolutas", () => {
    const r2 = readFileSync(resolve(DIR, "r2Storage.ts"), "utf-8");
    expect(r2).toContain('key.includes("..")');
    expect(r2).toContain('key.startsWith("/")');
    expect(r2).toContain("CARPETAS_PERMITIDAS");
  });
});

describe("escalada de privilegios", () => {
  it("ninguna Cloud Function escribe el campo role a partir de datos del cliente", () => {
    for (const archivo of readdirSync(DIR).filter((f) => f.endsWith(".ts"))) {
      const codigo = readFileSync(resolve(DIR, archivo), "utf-8");
      // Un `role: request.data.role` sería una vía directa a hacerse admin.
      expect(codigo, `${archivo} escribe role desde request.data`).not.toMatch(
        /role:\s*(String\()?request\.data/
      );
    }
  });

  it("crear cuentas de personal interno exige ser Gerente", () => {
    const c = readFileSync(resolve(DIR, "crearTrabajadorAcceso.ts"), "utf-8");
    expect(c).toMatch(/esGerente|role\s*!==\s*"admin"/);
  });
});
