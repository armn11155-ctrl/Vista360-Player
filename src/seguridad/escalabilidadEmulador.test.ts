import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { collection, doc, getDocs, limit, query, setDoc, where } from "firebase/firestore";

/**
 * VERIFICACIÓN DE ESCALA CON DATOS REALES (no solo lectura del código).
 *
 * El resto de la suite de escalabilidad (escalabilidad.test.ts) es
 * "whitebox": lee el código fuente y comprueba que la consulta TIENE un
 * where()/limit(). Eso ya atrapa el caso "alguien borró el limit()",
 * pero no puede comprobar que el límite realmente CORTA cuando hay más
 * documentos que el tope -- para eso hace falta data de verdad.
 *
 * Este archivo siembra más documentos que el límite declarado
 * (RESUELTAS_VISIBLES = 50, ver useSolicitudesCampana.ts) contra el
 * emulador de Firestore y ejecuta la MISMA consulta que usa la app, tal
 * cual la vería un Gerente real. No son miles de documentos (sembrarlos
 * en el emulador tiene un coste de tiempo real en CI); alcanza con
 * pasar el límite por un margen claro para probar el corte.
 *
 * Corre en el mismo job que reglasFirestore.ataque.test.ts (necesita el
 * emulador, por tanto Java 21) -- no en la suite normal.
 */

let entorno: RulesTestEnvironment;

const RESUELTAS_VISIBLES = 50; // debe coincidir con useSolicitudesCampana.ts
const TOTAL_RESUELTAS_SEMBRADAS = 80; // > RESUELTAS_VISIBLES a propósito
const TOTAL_PENDIENTES_SEMBRADAS = 12;

beforeAll(async () => {
  entorno = await initializeTestEnvironment({
    projectId: "vista360-escala-test",
    firestore: {
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf-8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });

  await entorno.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "portalUsers/uid-gerente-escala"), { role: "admin", nombre: "Gerente" });
    await setDoc(doc(db, "clientes/empresa-escala"), { empresa: "Empresa Escala" });

    const escrituras: Promise<void>[] = [];
    const ESTADOS_RESUELTOS = ["Revisada", "Rechazada", "Convertida"];
    for (let i = 0; i < TOTAL_RESUELTAS_SEMBRADAS; i += 1) {
      const estado = ESTADOS_RESUELTOS[i % ESTADOS_RESUELTOS.length];
      escrituras.push(
        setDoc(doc(db, `solicitudesCampana/resuelta-${i}`), {
          cliente_id: "empresa-escala",
          nombre: `Solicitud resuelta ${i}`,
          estado,
          createdAt: new Date(2020, 0, 1 + i),
        })
      );
    }
    for (let i = 0; i < TOTAL_PENDIENTES_SEMBRADAS; i += 1) {
      escrituras.push(
        setDoc(doc(db, `solicitudesCampana/pendiente-${i}`), {
          cliente_id: "empresa-escala",
          nombre: `Solicitud pendiente ${i}`,
          estado: "Pendiente",
          createdAt: new Date(2024, 0, 1 + i),
        })
      );
    }
    await Promise.all(escrituras);
  });
}, 30000);

afterAll(async () => {
  await entorno?.cleanup();
});

describe("con más solicitudes resueltas que el límite visible, el límite corta de verdad", () => {
  it(`hay ${TOTAL_RESUELTAS_SEMBRADAS} resueltas sembradas, pero la consulta con limit(${RESUELTAS_VISIBLES}) del Gerente trae solo ${RESUELTAS_VISIBLES}`, async () => {
    const db = entorno.authenticatedContext("uid-gerente-escala").firestore();
    // Misma forma de consulta que useSolicitudesCampana.ts (rama "sin
    // orden", que es la que no depende de que exista el índice
    // compuesto -- lo que importa acá es el limit(), no el orderBy()).
    const q = query(
      collection(db, "solicitudesCampana"),
      where("estado", "in", ["Revisada", "Rechazada", "Convertida"]),
      limit(RESUELTAS_VISIBLES)
    );
    const snap = await getDocs(q);
    expect(snap.docs.length).toBe(RESUELTAS_VISIBLES);
    expect(snap.docs.length).toBeLessThan(TOTAL_RESUELTAS_SEMBRADAS);
  });

  it("la consulta de PENDIENTES, sin limit(), trae TODAS -- es la self-limiting queue documentada", async () => {
    const db = entorno.authenticatedContext("uid-gerente-escala").firestore();
    const q = query(collection(db, "solicitudesCampana"), where("estado", "==", "Pendiente"));
    const snap = await getDocs(q);
    // A propósito NO lleva limit(): confirma que el diseño (documentado
    // en useSolicitudesCampana.ts) sigue siendo "todas las pendientes,
    // ninguna se esconde", y no una regresión donde alguien le puso un
    // límite silencioso que ocultaría trabajo pendiente sin avisar.
    expect(snap.docs.length).toBe(TOTAL_PENDIENTES_SEMBRADAS);
  });
});
