import { afterEach, describe, expect, it } from "vitest";
import { mensajeDeError } from "./errores";

function conNavigatorOnLine(valor: boolean, fn: () => void) {
  const original = Object.getOwnPropertyDescriptor(navigator, "onLine");
  Object.defineProperty(navigator, "onLine", { value: valor, configurable: true });
  try {
    fn();
  } finally {
    if (original) Object.defineProperty(navigator, "onLine", original);
  }
}

describe("mensajeDeError — prioridad código vs navigator.onLine", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("un código de error reconocido gana aunque el navegador diga que no hay red", () => {
    // navigator.onLine es conocido por dar falsos negativos -- si eso
    // se mirara primero, un "permission-denied" bien concreto quedaría
    // tapado por un "sin conexión" que ni siquiera es cierto.
    conNavigatorOnLine(false, () => {
      const r = mensajeDeError({ code: "permission-denied" }, "Respaldo.");
      expect(r).toBe("No tienes permiso para hacer esto.");
      expect(r).not.toMatch(/conexión/i);
    });
  });

  it("sin código reconocido, navigator.onLine=false sí dice sin conexión", () => {
    conNavigatorOnLine(false, () => {
      const r = mensajeDeError(new Error("algo raro pasó"), "Respaldo.");
      expect(r).toMatch(/conexión/i);
    });
  });

  it("con navigator.onLine=true, un error de red por texto igual se detecta", () => {
    conNavigatorOnLine(true, () => {
      const r = mensajeDeError(new TypeError("Failed to fetch"), "Respaldo.");
      expect(r).toMatch(/conexión/i);
    });
  });
});

describe("mensajeDeError — códigos de Firebase Auth", () => {
  it("distingue un problema de login de un problema de red real", () => {
    const password = mensajeDeError({ code: "auth/wrong-password" }, "Respaldo.");
    const red = mensajeDeError({ code: "auth/network-request-failed" }, "Respaldo.");
    expect(password).toMatch(/incorrectos/i);
    expect(red).toMatch(/conexión/i);
    expect(password).not.toBe(red);
  });

  it("too-many-requests no se confunde con un problema de conexión", () => {
    const r = mensajeDeError({ code: "auth/too-many-requests" }, "Respaldo.");
    expect(r).toMatch(/intentos/i);
    expect(r).not.toMatch(/conexión/i);
  });

  it("SEGURIDAD: wrong-password, user-not-found e invalid-credential dan EXACTAMENTE el mismo mensaje", () => {
    // Antes "user-not-found" decía "no existe una cuenta con ese
    // correo" y "wrong-password" decía "contraseña incorrecta" -- dos
    // mensajes distintos que le dicen a quien prueba una lista de
    // correos cuáles SÍ tienen cuenta en Vista360, sin necesitar
    // adivinar ninguna contraseña (enumeración de usuarios, OWASP).
    // Los tres códigos deben ser indistinguibles para quien los lee.
    const wrongPassword = mensajeDeError({ code: "auth/wrong-password" }, "Respaldo.");
    const userNotFound = mensajeDeError({ code: "auth/user-not-found" }, "Respaldo.");
    const invalidCredential = mensajeDeError({ code: "auth/invalid-credential" }, "Respaldo.");
    expect(wrongPassword).toBe(userNotFound);
    expect(userNotFound).toBe(invalidCredential);
    expect(wrongPassword).toMatch(/incorrectos/i);
  });
});
