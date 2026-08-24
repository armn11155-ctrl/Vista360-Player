import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * EJECUCIÓN REAL (no whitebox) del helper centralizado de cuenta de
 * portal -- auditoría de ciberseguridad, agosto 2026, cierre de la
 * ventana residual de sesión archivada en Cloud Functions.
 *
 * QUÉ PROBLEMA CIERRA ESTE ARCHIVO
 *
 * `firestore.rules` ya corta a una cuenta archivada de inmediato (ver
 * cuentaArchivada.test.ts), pero las Cloud Functions usan el Admin SDK,
 * que SE SALTA esas reglas. Antes de esta auditoría, cada función
 * comprobaba el ROL leyendo portalUsers/{uid} a mano, pero NINGUNA
 * comprobaba el campo `archived` -- así que un token todavía válido
 * (hasta ~1 hora, antes de que expire solo) podía seguir llamando
 * Cloud Functions después de que su cuenta quedara archivada.
 *
 * En vez de copiar "y ahora comprueba archived también" en las ~50
 * Cloud Functions callable del proyecto (exactamente el tipo de bug
 * que ese copy-paste termina produciendo), se centralizó la
 * comprobación en functions/src/cuentaPortal.ts, y las ~50 funciones
 * pasaron a depender de ese único lugar (ver
 * src/logica-negocio/controlDeAcceso.test.ts para la prueba whitebox
 * de que NINGUNA función se saltó la migración).
 *
 * Este archivo no lee texto: EJECUTA de verdad exigirCuentaActiva,
 * exigirGerente y exigirPersonalInterno contra el emulador de
 * Firestore, con cuentas sembradas activas y archivadas, simulando
 * exactamente el escenario del playbook de incidentes -- "un token
 * todavía válido, después de archivar la cuenta".
 *
 * CÓMO SE SEMBRÓ LOS DATOS. Se usa el SDK de CLIENTE (igual que
 * cuentaArchivada.test.ts) con las reglas de seguridad desactivadas,
 * no el Admin SDK -- porque functions/ tiene su PROPIA copia de
 * firebase-admin (node_modules separado del root), y el módulo
 * cuentaPortal.ts que se ejecuta acá abajo usa ESA copia para
 * inicializar su propia app por defecto. Si se sembrara con un
 * firebase-admin distinto (el del root), serían dos apps/procesos
 * "default" separados hablando con el mismo emulador -- funcionaría
 * por la vía lenta (los dos apuntan al mismo emulador por red), pero
 * mezclar dos instancias del SDK admin en el mismo proceso es frágil.
 * El SDK de cliente no tiene ese problema: siempre es el mismo paquete
 * "firebase" del root, y el emulador no distingue qué SDK escribió un
 * documento.
 */

const PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-vista360-reglas";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = PROJECT_ID;
// `firebase emulators:exec --project ...` también define FIREBASE_CONFIG.
// Antes, el cliente sembraba `vista360-cuentaportal-test` mientras Admin
// respetaba ese FIREBASE_CONFIG y leía `demo-vista360-reglas`: dos namespaces
// distintos dentro del mismo emulador. Por eso CI decía que todas las fichas
// recién sembradas "no existían". Una sola fuente de verdad evita el drift.
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT_ID });

let entorno: RulesTestEnvironment;

const {
  exigirCuentaActiva,
  exigirGerente,
  exigirPersonalInterno,
  exigirAutenticacionReciente,
  exigirQueNoSeaUnoMismo,
  EDAD_MAXIMA_AUTENTICACION_RECIENTE_SEG,
} = await import(
  "../../functions/src/cuentaPortal.js"
);

/** Fabrica el mismo objeto mínimo que le pasaría onCall() a la función:
 *  solo lo que cuentaPortal.ts realmente lee (request.auth?.uid). */
function pedidoDe(uid: string | undefined) {
  return { auth: uid ? { uid } : null };
}

beforeAll(async () => {
  entorno = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf-8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });

  await entorno.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    await setDoc(doc(db, "portalUsers/uid-cliente-activo"), { role: "cliente", clienteId: "empresa-1", nombre: "Cliente Activo" });
    await setDoc(doc(db, "portalUsers/uid-trabajador-activo"), { role: "trabajador", nombre: "Trabajador Activo" });
    await setDoc(doc(db, "portalUsers/uid-gerente-activo"), { role: "admin", nombre: "Gerente Activo" });

    // Las tres cuentas "robadas": archivadas, pero con un uid que se
    // sigue usando en la llamada -- es EXACTAMENTE lo que pasaría con
    // un ID token todavía sin expirar.
    await setDoc(doc(db, "portalUsers/uid-cliente-archivado"), {
      role: "cliente",
      clienteId: "empresa-2",
      nombre: "Cliente Archivado",
      archived: true,
    });
    await setDoc(doc(db, "portalUsers/uid-trabajador-archivado"), {
      role: "trabajador",
      nombre: "Trabajador Archivado",
      archived: true,
    });
    await setDoc(doc(db, "portalUsers/uid-gerente-archivado"), {
      role: "admin",
      nombre: "Gerente Archivado",
      archived: true,
    });

    await setDoc(doc(db, "portalUsers/uid-rol-corrupto"), { nombre: "Ficha sin rol reconocido" });
  });
});

afterAll(async () => {
  await entorno?.cleanup();
});

describe("cuenta ACTIVA: las tres funciones legítimas de cada rol funcionan", () => {
  it("Cliente activo: exigirCuentaActiva resuelve con su clienteId", async () => {
    const cuenta = await exigirCuentaActiva(pedidoDe("uid-cliente-activo"));
    expect(cuenta.uid).toBe("uid-cliente-activo");
    expect(cuenta.role).toBe("cliente");
    expect(cuenta.clienteId).toBe("empresa-1");
  });

  it("Trabajador activo: exigirPersonalInterno resuelve (Trabajador SÍ es personal interno)", async () => {
    const cuenta = await exigirPersonalInterno(pedidoDe("uid-trabajador-activo"));
    expect(cuenta.uid).toBe("uid-trabajador-activo");
    expect(cuenta.role).toBe("trabajador");
  });

  it("Gerente activo: exigirGerente resuelve", async () => {
    const cuenta = await exigirGerente(pedidoDe("uid-gerente-activo"));
    expect(cuenta.uid).toBe("uid-gerente-activo");
    expect(cuenta.role).toBe("admin");
  });

  it("Gerente activo también pasa exigirPersonalInterno (Gerente ES personal interno)", async () => {
    const cuenta = await exigirPersonalInterno(pedidoDe("uid-gerente-activo"));
    expect(cuenta.role).toBe("admin");
  });

  it("Cliente activo NO pasa exigirPersonalInterno (un cliente no es equipo interno)", async () => {
    await expect(exigirPersonalInterno(pedidoDe("uid-cliente-activo"))).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("Trabajador activo NO pasa exigirGerente (Trabajador no es Gerente)", async () => {
    await expect(exigirGerente(pedidoDe("uid-trabajador-activo"))).rejects.toMatchObject({
      code: "permission-denied",
    });
  });
});

describe("cuenta ARCHIVADA (token todavía válido simulado): DENIED en las tres, sin excepción", () => {
  it("Cliente archivado: exigirCuentaActiva rechaza con permission-denied", async () => {
    await expect(exigirCuentaActiva(pedidoDe("uid-cliente-archivado"))).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("Trabajador archivado: exigirPersonalInterno rechaza con permission-denied", async () => {
    await expect(exigirPersonalInterno(pedidoDe("uid-trabajador-archivado"))).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("Gerente archivado: exigirGerente rechaza con permission-denied", async () => {
    await expect(exigirGerente(pedidoDe("uid-gerente-archivado"))).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("Gerente archivado NO puede colarse por exigirCuentaActiva tampoco (no solo por exigirGerente)", async () => {
    // Confirma que el corte es en la capa base (exigirCuentaActiva), no
    // solo en el wrapper de rol -- así ninguna función que use
    // exigirCuentaActiva "a secas" (como registrarAcceso, sin exigir
    // ningún rol en particular) deja pasar a una cuenta archivada.
    await expect(exigirCuentaActiva(pedidoDe("uid-gerente-archivado"))).rejects.toMatchObject({
      code: "permission-denied",
    });
  });
});

describe("casos límite", () => {
  it("sin uid (llamada directa sin sesión) se rechaza con unauthenticated, no con permission-denied", async () => {
    await expect(exigirCuentaActiva(pedidoDe(undefined))).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("un uid que no tiene ficha en portalUsers se rechaza con permission-denied", async () => {
    await expect(exigirCuentaActiva(pedidoDe("uid-que-no-existe"))).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("una ficha sin un rol reconocido (admin/trabajador/cliente) se rechaza, no se trata como cliente por defecto", async () => {
    // Defensa en profundidad: un documento corrupto o a medio migrar no
    // debe colarse como si fuera una cuenta válida de ningún tipo.
    await expect(exigirCuentaActiva(pedidoDe("uid-rol-corrupto"))).rejects.toMatchObject({
      code: "permission-denied",
    });
  });
});

/**
 * ── CIERRE DE SEGURIDAD DE LA CUENTA GERENTE ───────────────────────────
 *
 * Ejecución REAL de las protecciones nuevas contra el emulador. No se
 * comprueba que el código "mencione" la protección: se llama la función
 * de producción y se comprueba qué contesta.
 */
describe("sesiones cerradas a propósito (Cerrar todas mis sesiones)", () => {
  it("una sesión ANTERIOR al corte queda fuera, aunque su token siga vivo", async () => {
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "portalUsers/uid-corto-sesiones"), {
        role: "admin",
        nombre: "Gerente que cerró sus sesiones",
        // El corte ocurrió DESPUÉS de que esta sesión se autenticara.
        sessionsRevokedAt: 2_000,
      });
    });
    await expect(
      exigirCuentaActiva({ auth: { uid: "uid-corto-sesiones", token: { auth_time: 1_000 } } })
    ).rejects.toThrow(/cerraron todas las sesiones/i);
  });

  it("una sesión POSTERIOR al corte sí funciona (volver a entrar te devuelve el acceso)", async () => {
    const cuenta = await exigirCuentaActiva({
      auth: { uid: "uid-corto-sesiones", token: { auth_time: 3_000 } },
    });
    expect(cuenta.role).toBe("admin");
  });

  it("sin sessionsRevokedAt, una cuenta normal no se ve afectada", async () => {
    const cuenta = await exigirCuentaActiva({
      auth: { uid: "uid-gerente-activo", token: { auth_time: 1 } },
    });
    expect(cuenta.role).toBe("admin");
  });

  it("un token SIN auth_time se rechaza si la cuenta cortó sesiones (falla cerrado)", async () => {
    await expect(
      exigirCuentaActiva({ auth: { uid: "uid-corto-sesiones" } })
    ).rejects.toThrow(/cerraron todas las sesiones/i);
  });
});

describe("autenticación reciente para acciones críticas", () => {
  const ahora = () => Math.floor(Date.now() / 1000);

  it("una sesión recién autenticada pasa", () => {
    expect(() =>
      exigirAutenticacionReciente({ auth: { uid: "u", token: { auth_time: ahora() } } })
    ).not.toThrow();
  });

  it("una sesión autenticada hace horas NO pasa", () => {
    expect(() =>
      exigirAutenticacionReciente({ auth: { uid: "u", token: { auth_time: ahora() - 3600 } } })
    ).toThrow(/contraseña/i);
  });

  it("justo por encima de la ventana NO pasa", () => {
    expect(() =>
      exigirAutenticacionReciente({
        auth: { uid: "u", token: { auth_time: ahora() - (EDAD_MAXIMA_AUTENTICACION_RECIENTE_SEG + 5) } },
      })
    ).toThrow();
  });

  it("un token sin auth_time NO pasa (no se puede probar nada, así que no se acepta)", () => {
    expect(() => exigirAutenticacionReciente({ auth: { uid: "u" } })).toThrow();
  });

  it("NO se puede falsificar mandando datos en el body: solo se mira el token", () => {
    // Esto es lo que intentaría alguien desde DevTools. El objeto que
    // llega trae "reautenticado: true" en data, y da igual: la función
    // no mira data en absoluto.
    const intento = {
      auth: { uid: "u", token: { auth_time: ahora() - 7200 } },
      data: { reautenticado: true, reauthenticated: true, mfaPassed: true },
    };
    expect(() => exigirAutenticacionReciente(intento)).toThrow();
  });
});

describe("nadie puede archivarse ni eliminarse a sí mismo", () => {
  it("actor === objetivo se rechaza", () => {
    expect(() => exigirQueNoSeaUnoMismo("uid-gerente-activo", "uid-gerente-activo")).toThrow(
      /tu propia cuenta/i
    );
  });

  it("actor !== objetivo se permite (sí se puede cortar a otro Gerente)", () => {
    expect(() => exigirQueNoSeaUnoMismo("uid-gerente-activo", "uid-otro-gerente")).not.toThrow();
  });

  it("sin objetivo (solo invitación) no bloquea nada", () => {
    expect(() => exigirQueNoSeaUnoMismo("uid-gerente-activo", null)).not.toThrow();
    expect(() => exigirQueNoSeaUnoMismo("uid-gerente-activo", undefined)).not.toThrow();
  });
});
