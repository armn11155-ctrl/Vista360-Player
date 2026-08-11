import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * VERSIONES DEL SDK DE CLOUD FUNCTIONS.
 *
 * Un SDK sin soporte sigue funcionando hasta que deja de hacerlo: Google
 * retira runtimes de Node, cambia APIs internas, o el despliegue empieza
 * a rechazarlo. Cuando eso pasa ya no puedes desplegar NADA hasta
 * actualizar, y para entonces el salto es de cuatro versiones en vez de
 * una, con prisa y sin margen para probar.
 *
 * Estos tests fijan lo que hace que el salto siga siendo barato: que
 * todo el código use la API v2 y que no vuelva a entrar nada de lo que
 * ya fue retirado.
 */

const RAIZ = resolve(__dirname, "../..");
const paquete = JSON.parse(readFileSync(resolve(RAIZ, "functions/package.json"), "utf-8"));

function fuentes(): string {
  const { readdirSync } = require("node:fs") as typeof import("node:fs");
  const dir = resolve(RAIZ, "functions/src");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => readFileSync(resolve(dir, f), "utf-8"))
    .join("\n");
}

describe("el SDK está en una versión con soporte", () => {
  it("firebase-functions es v7 o superior", () => {
    const v = String(paquete.dependencies["firebase-functions"]);
    expect(Number(/(\d+)/.exec(v)![1])).toBeGreaterThanOrEqual(7);
  });

  it("firebase-admin es v14 o superior", () => {
    const v = String(paquete.dependencies["firebase-admin"]);
    expect(Number(/(\d+)/.exec(v)![1])).toBeGreaterThanOrEqual(14);
  });
});

describe("nada de lo retirado vuelve a entrar", () => {
  const codigo = fuentes();

  it("NO se usa functions.config(), retirado en v7", () => {
    // Es EL cambio que rompe entre la v6 y la v7. Que este proyecto no lo
    // usara es lo que hizo que la actualización costara media hora en vez
    // de un rediseño de la configuración.
    expect(codigo).not.toContain("functions.config(");
  });

  it("NO se usan las opciones de la API v1", () => {
    for (const retirada of [".runWith(", "functions.region("]) {
      expect(codigo, `${retirada} es de la API v1`).not.toContain(retirada);
    }
  });

  it("TODO se declara con la API v2", () => {
    // 51 funciones https + scheduler + firestore. Si alguien añade una
    // con la API v1, este test lo dice antes de que se despliegue.
    const v1 = codigo.match(/functions\.(https|firestore|pubsub|auth|storage)\./g) ?? [];
    expect(v1).toEqual([]);
    expect(codigo).toContain('from "firebase-functions/v2/https"');
  });

  it("lo único que se importa de la raíz, en cualquier archivo, es el logger", () => {
    // `firebase-functions` a secas trae la API v1 entera. Se usa solo
    // para el logger, que sigue existiendo en la v7. Antes este test
    // exigia que hubiera COMO MAXIMO un import de este tipo en todo el
    // proyecto -- una casualidad de que solo registro.ts lo hacia, no
    // la regla real. Ahora firmarUrlsR2.ts tambien importa el logger
    // (para poder registrar intentos de acceso a keys ajenas), asi que
    // lo que de verdad importa -- y lo que se comprueba aca -- es que
    // CADA import de la raiz trae unicamente el logger, sin importar
    // cuantos archivos lo hagan.
    const raiz = [...codigo.matchAll(/import \{([^}]*)\} from "firebase-functions";/g)];
    expect(raiz.length).toBeGreaterThan(0);
    for (const [, contenido] of raiz) {
      // Exacto, no "contiene": "{ logger, region }" tambien "contiene"
      // logger y coleria a un import v1 sin que este test se diera cuenta.
      expect(contenido.trim()).toBe("logger");
    }
  });
});
