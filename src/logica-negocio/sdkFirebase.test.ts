import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { initializeApp } from "firebase/app";
import {
  EmailAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  reauthenticateWithCredential,
  setPersistence,
  updatePassword,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

/**
 * El SDK de Firebase estaba dos versiones mayores por detrás (10.14.1,
 * de octubre de 2024). Un salto de mayor puede quitar o renombrar cosas
 * sin que TypeScript se entere si el paquete trae tipos permisivos.
 *
 * Esta prueba IMPORTA de verdad cada símbolo que usa la aplicación y
 * comprueba que exista y sea invocable. Si una versión futura quita
 * cualquiera de ellos, la suite falla antes de llegar a producción, en
 * vez de que se entere un cliente al no poder iniciar sesión.
 */
describe("superficie del SDK de Firebase que usa la aplicación", () => {
  const simbolos: Record<string, unknown> = {
    initializeApp,
    getAuth,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword,
    getFirestore,
    collection,
    doc,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    getFunctions,
    httpsCallable,
  };

  it("todos los símbolos existen y son invocables", () => {
    const rotos = Object.entries(simbolos)
      .filter(([, valor]) => typeof valor !== "function" && typeof valor !== "object")
      .map(([nombre]) => nombre);
    expect(rotos).toEqual([]);
  });

  it("EmailAuthProvider.credential sigue construyendo credenciales", () => {
    // Es la que usa el cambio de contraseña: si desaparece, la persona
    // no puede cambiarla y el error solo se ve en producción.
    const credencial = EmailAuthProvider.credential("a@b.com", "secreto");
    expect(credencial.providerId).toBe("password");
  });

  it("las persistencias y setPersistence siguen existiendo", () => {
    // setPersistence(auth, browserLocalPersistence) es lo que mantiene la
    // sesión abierta entre visitas.
    //
    // LO QUE ESTA PRUEBA **NO** COMPRUEBA, dicho de frente:
    //
    // Bajo Node, el SDK resuelve su build de servidor y las dos
    // persistencias salen siendo EL MISMO objeto en memoria, con
    // `type: "NONE"`. Se verificó que la versión 10 hacía exactamente lo
    // mismo, así que no es una regresión de la 12: es el entorno de
    // pruebas. Se intentó forzar la condición "browser" en vitest y el
    // paquete no la respeta.
    //
    // Conclusión honesta: que la sesión persista de verdad entre visitas
    // SOLO se puede comprobar iniciando sesión en un navegador real.
    // Afirmar aquí que vale "LOCAL" sería afirmar algo falso.
    expect(browserLocalPersistence).toBeDefined();
    expect(browserSessionPersistence).toBeDefined();
    expect(typeof setPersistence).toBe("function");
  });

  it("initializeApp y getFirestore/getFunctions se encadenan", () => {
    // Prueba de humo del arranque real: si alguna firma cambió, revienta acá.
    const app = initializeApp(
      { apiKey: "prueba", projectId: "prueba", appId: "1:1:web:1" },
      `prueba-${Math.random()}`,
    );
    const db = getFirestore(app);
    expect(typeof collection(db, "clientes")).toBe("object");
    expect(typeof doc(db, "clientes/abc")).toBe("object");
    expect(typeof query(collection(db, "facturas"), where("estado", "==", "x"), orderBy("f"), limit(5))).toBe("object");
    expect(typeof httpsCallable(getFunctions(app), "registrarVisita")).toBe("function");
  });

  it("la versión instalada es la que dice el package.json", () => {
    const raiz = resolve(__dirname, "../..");
    const declarada = JSON.parse(readFileSync(resolve(raiz, "package.json"), "utf-8")).dependencies.firebase;
    const instalada = JSON.parse(
      readFileSync(resolve(raiz, "node_modules/firebase/package.json"), "utf-8"),
    ).version;
    expect(instalada.startsWith(declarada.replace(/^[\^~]/, "").split(".")[0])).toBe(true);
  });
  it("ningun paquete exige una version de firebase distinta a la instalada", () => {
    /**
     * ESTO ES LO QUE ROMPIO EL DESPLIEGUE, y no lo vi.
     *
     * Al subir firebase a la 12, `@firebase/rules-unit-testing@3.0.4` se
     * quedo pidiendo `firebase@^10.0.0` como peer. `npm run build` seguia
     * pasando -- yo lo probe y dije que estaba listo -- pero Cloudflare
     * hace `npm clean-install` ANTES de compilar, y npm ci es estricto
     * con los peers: fallaba con ERESOLVE sin llegar a compilar nunca.
     *
     * Verificar el build no es verificar el despliegue. Esta prueba mira
     * los peers, que es donde estaba el problema real.
     */
    const raiz = resolve(__dirname, "../..");
    const paquete = JSON.parse(readFileSync(resolve(raiz, "package.json"), "utf-8"));
    const instalada = JSON.parse(
      readFileSync(resolve(raiz, "node_modules/firebase/package.json"), "utf-8"),
    ).version;
    const mayorInstalada = instalada.split(".")[0];

    const conflictos: string[] = [];
    const dependencias = [
      ...Object.keys(paquete.dependencies ?? {}),
      ...Object.keys(paquete.devDependencies ?? {}),
    ];
    for (const nombre of dependencias) {
      if (nombre === "firebase") continue;
      let manifiesto;
      try {
        manifiesto = JSON.parse(
          readFileSync(resolve(raiz, `node_modules/${nombre}/package.json`), "utf-8"),
        );
      } catch {
        continue;
      }
      const exigido = manifiesto.peerDependencies?.firebase;
      if (!exigido) continue;
      // Se compara solo la mayor: "^12.0.0" contra la 12 instalada.
      const mayorExigida = exigido.replace(/[^\d.]/g, "").split(".")[0];
      if (mayorExigida && mayorExigida !== mayorInstalada) {
        conflictos.push(`${nombre} exige firebase ${exigido} pero hay ${instalada}`);
      }
    }
    expect(conflictos).toEqual([]);
  });

});
