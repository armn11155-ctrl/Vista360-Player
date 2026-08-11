import { afterAll, beforeAll, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { doc, getDoc, setDoc } from "firebase/firestore";

/**
 * REGRESIÓN DE SEGURIDAD — auditoría de ciberseguridad, agosto 2026.
 *
 * Pregunta del playbook de incidentes: "si mañana roban una cuenta
 * Gerente, ¿cómo revocamos inmediatamente la sesión?". Antes de esta
 * revisión, "archivar" a alguien (administrarUsuarioPortal.ts) ponía
 * `disabled: true` en Firebase Auth, pero eso SOLO bloquea inicios de
 * sesión y renovaciones NUEVAS -- un token ya emitido seguía abriendo
 * Firestore normalmente hasta que expirara solo (hasta 1 hora), porque
 * ninguna regla comprobaba el campo `archived` del documento
 * portalUsers.
 *
 * Este archivo siembra una cuenta archivada de verdad y confirma, con
 * el emulador (no solo leyendo el código), que las reglas la cortan de
 * inmediato -- sin esperar a que el token expire.
 */

let entorno: RulesTestEnvironment;

beforeAll(async () => {
  entorno = await initializeTestEnvironment({
    projectId: "vista360-archivado-test",
    firestore: {
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf-8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });

  await entorno.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // Gerente archivado: robaron su cuenta, el Gerente restante lo
    // archivó, pero su token de sesión (simulado acá por el emulador,
    // que no revisa expiración real) sigue "vivo".
    await setDoc(doc(db, "portalUsers/uid-gerente-archivado"), {
      role: "admin",
      nombre: "Gerente Archivado",
      archived: true,
    });
    // Cliente archivado, para confirmar que la regla aplica a
    // cualquier rol, no solo a personal interno.
    await setDoc(doc(db, "portalUsers/uid-cliente-archivado"), {
      role: "cliente",
      clienteId: "empresa-archivada",
      archived: true,
    });
    // Gerente activo de control, para confirmar que la regla nueva NO
    // rompe el caso normal.
    await setDoc(doc(db, "portalUsers/uid-gerente-activo"), {
      role: "admin",
      nombre: "Gerente Activo",
    });
    await setDoc(doc(db, "clientes/empresa-archivada"), { empresa: "Empresa Archivada" });
    await setDoc(doc(db, "clientes/empresa-control"), { empresa: "Empresa Control" });
    await setDoc(doc(db, "paneles/p1"), { nombre: "Panel Control" });
  });
});

afterAll(async () => {
  await entorno?.cleanup();
});

describe("una cuenta archivada pierde acceso a Firestore de inmediato, sin esperar a que expire el token", () => {
  it("un Gerente archivado NO puede leer clientes (antes sí podía, por ser admin)", async () => {
    const db = entorno.authenticatedContext("uid-gerente-archivado").firestore();
    await assertFails(getDoc(doc(db, "clientes/empresa-control")));
  });

  it("un Gerente archivado NO puede leer paneles", async () => {
    const db = entorno.authenticatedContext("uid-gerente-archivado").firestore();
    await assertFails(getDoc(doc(db, "paneles/p1")));
  });

  it("un Gerente archivado SÍ puede leer su propia ficha (para ver que está archivado)", async () => {
    const db = entorno.authenticatedContext("uid-gerente-archivado").firestore();
    await assertSucceeds(getDoc(doc(db, "portalUsers/uid-gerente-archivado")));
  });

  it("un Cliente archivado NO puede leer ni siquiera su propia empresa", async () => {
    const db = entorno.authenticatedContext("uid-cliente-archivado").firestore();
    await assertFails(getDoc(doc(db, "clientes/empresa-archivada")));
  });

  it("un Gerente activo (de control) SIGUE pudiendo leer normalmente -- la regla no rompió el caso normal", async () => {
    const db = entorno.authenticatedContext("uid-gerente-activo").firestore();
    await assertSucceeds(getDoc(doc(db, "clientes/empresa-control")));
    await assertSucceeds(getDoc(doc(db, "paneles/p1")));
  });
});
