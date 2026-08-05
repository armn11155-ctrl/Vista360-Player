import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * LOS TOPES DUROS DE FIREBASE, Y QUIÉN AVISA ANTES DE LLEGAR.
 *
 * Un límite técnico es la peor clase de bomba de tiempo: no se acerca
 * despacio dando señales, se cruza un día cualquiera y a partir de ahí
 * la operación falla SIEMPRE. Y suele cruzarse justo cuando el negocio
 * va bien, que es el peor momento para descubrirlo.
 *
 * Estos son los que puede tocar esta aplicación:
 *
 *   1 MB     por documento de Firestore
 *   500      escrituras por lote (batch)
 *   30       elementos en un `in` / `array-contains-any`
 *   500      tokens por envío de notificaciones (FCM)
 *   540 s    máximo de una Cloud Function
 *
 * Este archivo comprueba que cada uno tenga un aviso ANTES, o que la
 * estructura crezca por sí sola sin alcanzarlo.
 */

const RAIZ = resolve(__dirname, "../..");
const FUNCIONES = resolve(RAIZ, "functions/src");
const leer = (p: string) => readFileSync(resolve(RAIZ, p), "utf-8");

/** Sin comentarios: varios explican precisamente el patrón que ya NO se
 *  usa, y buscarlo en el texto daría un falso positivo. */
const leerCodigo = (p: string) =>
  leer(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

describe("1 MB por documento: todo agregado avisa o se reparte", () => {
  it("el inventario de paneles avisa antes del tope", () => {
    const f = leer("functions/src/agregadoPaneles.ts");
    const aviso = Number(/AVISO_A_PARTIR_DE = (\d+)/.exec(f)![1]);
    // ~300 bytes por panel: el techo real ronda los 3.000.
    expect(aviso).toBeGreaterThan(0);
    expect(aviso).toBeLessThan(3000);
    expect(f).toContain("console.warn");
  });

  it("la lista de clientes NO avisa: se reparte sola en partes", () => {
    // Es mejor que avisar. Un aviso exige que alguien reaccione; esto
    // crece solo hasta decenas de miles sin que nadie haga nada.
    const f = leer("functions/src/agregadoClientes.ts");
    const porParte = Number(/CLIENTES_POR_PARTE = (\d+)/.exec(f)![1]);
    expect(porParte).toBeGreaterThan(0);
    expect(porParte).toBeLessThanOrEqual(4000);
    expect(f).toContain("Math.ceil(total / CLIENTES_POR_PARTE)");
  });

  it("el resumen de cada cliente avisa por campañas y por facturas", () => {
    const f = leer("functions/src/agregadoCliente.ts");
    expect(f).toMatch(/AVISO_CONTRATOS = \d+/);
    expect(f).toMatch(/AVISO_FACTURAS = \d+/);
    expect((f.match(/console\.warn/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("500 escrituras por lote", () => {
  it("ningún lote crece con el número de clientes o de campañas", () => {
    // Los lotes que existen recorren los usuarios de UN cliente (uno o
    // dos) o las partes del agregado (una por cada 2.000 clientes). El
    // único que podría crecer de verdad ya trocea.
    const conLote = readdirSync(FUNCIONES)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => readFileSync(resolve(FUNCIONES, f), "utf-8").includes("db.batch()"));
    expect(conLote.length).toBeGreaterThan(0);

    // administrarClienteAdmin borra TODO lo de un cliente: ese sí puede
    // tener miles de documentos, y por eso trocea.
    const borrado = leer("functions/src/administrarClienteAdmin.ts");
    expect(borrado).toMatch(/batch = db\.batch\(\)/);
    const tope = /(\d+)\s*\)\s*\{\s*\n\s*await batch\.commit|>= (\d+)/.exec(borrado);
    expect(tope, "administrarClienteAdmin debe trocear el borrado").not.toBeNull();
  });
});

describe("500 tokens por envío de notificaciones", () => {
  it("los tokens de cada persona están acotados al guardarlos", () => {
    // arrayUnion NO quita nunca, y los tokens de FCM rotan solos: cada
    // dispositivo, cada reinstalación, cada rotación añadía uno más. Al
    // pasar de 500 el envío lanza y esa persona deja de recibir avisos
    // POR COMPLETO -- sin error visible, porque quien no recibe un aviso
    // no sabe que no lo está recibiendo.
    const f = leerCodigo("functions/src/guardarTokenPush.ts");
    expect(f).not.toContain("arrayUnion");
    const max = Number(/MAX_TOKENS_POR_USUARIO = (\d+)/.exec(f)![1]);
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(50);
    expect(f).toContain(".slice(-MAX_TOKENS_POR_USUARIO)");
  });

  it("se escribe en una transacción: dos dispositivos a la vez no se pisan", () => {
    // Leer-modificar-escribir sin transacción pierde el token del otro
    // dispositivo si ambos se registran a la vez.
    expect(leer("functions/src/guardarTokenPush.ts")).toContain("db.runTransaction");
  });

  it("el envío recorta a 500 aunque queden datos viejos", () => {
    // Red de seguridad para las cuentas cuyo array creció ANTES del
    // arreglo de arriba. Sin esto, una sola cuenta con el array crecido
    // tumbaría el envío a todas las demás de esa tanda.
    const f = leer("functions/src/notificacionesPush.ts");
    expect(f).toMatch(/TOPE_TOKENS_POR_ENVIO = 500/);
    expect((f.match(/slice\(0, TOPE_TOKENS_POR_ENVIO\)/g) ?? []).length).toBe(2);
    // Y los índices de la respuesta tienen que ser los de lo ENVIADO,
    // no los de la lista completa, o se marcaría como inválido el token
    // equivocado.
    expect(f).not.toContain("tokensInvalidos.push(tokens[i])");
    expect((f.match(/tokensInvalidos\.push\(aEnviar\[i\]\)/g) ?? []).length).toBe(2);
  });
});

describe("30 elementos en un `in`", () => {
  it("ninguna consulta usa una lista que pueda crecer", () => {
    const archivos = [
      ...readdirSync(FUNCIONES).filter((f) => f.endsWith(".ts")).map((f) => resolve(FUNCIONES, f)),
      ...readdirSync(resolve(RAIZ, "src/hooks"))
        .filter((f) => f.endsWith(".ts") && !f.includes(".test."))
        .map((f) => resolve(RAIZ, "src/hooks", f)),
    ];
    for (const ruta of archivos) {
      const codigo = readFileSync(ruta, "utf-8");
      for (const m of codigo.matchAll(/where\([^,]+,\s*"(in|array-contains-any)"\s*,\s*([^)]+)\)/g)) {
        // Solo se admite una lista literal escrita a mano (que no crece).
        expect(m[2], `${ruta}: lista dinámica en un "${m[1]}"`).toMatch(/\[|ESTADOS_/);
      }
    }
  });
});

describe("540 s por Cloud Function", () => {
  it("las funciones que recorren colecciones enteras declaran su tiempo", () => {
    for (const nombre of [
      "limpiarArchivosHuerfanos",
      "resumenOcupacion",
      "contarEvidenciasHuerfanas",
      "obtenerEspacioR2",
      "sincronizarEstadoPaneles",
    ]) {
      const f = readFileSync(resolve(FUNCIONES, `${nombre}.ts`), "utf-8");
      const t = /timeoutSeconds:\s*(\d+)/.exec(f);
      expect(t, `${nombre} usaría los 60 s por defecto`).not.toBeNull();
      expect(Number(t![1])).toBeLessThanOrEqual(540);
    }
  });
});
