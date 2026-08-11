import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * REGRESIÓN — administrarUsuarioPortal.ts debe revocar los refresh
 * tokens al archivar o eliminar a alguien, no solo poner disabled:true.
 * `disabled:true` por sí solo NO corta una sesión ya iniciada -- el
 * token vigente sigue funcionando hasta que expira solo (hasta 1 hora).
 */

const codigo = readFileSync(
  resolve(__dirname, "../../functions/src/administrarUsuarioPortal.ts"),
  "utf-8"
);

describe("archivar/eliminar un usuario revoca su sesión de inmediato", () => {
  it("declara revokeRefreshTokens al menos dos veces (archivar y eliminar)", () => {
    const apariciones = (codigo.match(/revokeRefreshTokens\(uid\)/g) ?? []).length;
    expect(apariciones).toBeGreaterThanOrEqual(2);
  });

  it("revoca junto con disabled:true al archivar (no puede faltar en esa rama)", () => {
    // if (accion === "archivar") { ... } es único en el bloque de Auth
    // (más arriba solo aparecen comparaciones sueltas dentro de objetos
    // Firestore, no un `if`), así que ancla bien el inicio de la rama.
    const inicioIfArchivar = codigo.indexOf('if (accion === "archivar")');
    expect(inicioIfArchivar).toBeGreaterThan(-1);
    const inicioElseIfRestaurar = codigo.indexOf('else if (accion === "restaurar")', inicioIfArchivar);
    expect(inicioElseIfRestaurar).toBeGreaterThan(inicioIfArchivar);
    const bloqueArchivar = codigo.slice(inicioIfArchivar, inicioElseIfRestaurar);
    expect(bloqueArchivar).toContain("updateUser(uid, { disabled: true })");
    expect(bloqueArchivar).toContain("revokeRefreshTokens(uid)");
  });

  it("revoca también en la rama de eliminación definitiva (el else final)", () => {
    const inicioElseIfRestaurar = codigo.indexOf('else if (accion === "restaurar")');
    const bloqueEliminar = codigo.slice(inicioElseIfRestaurar);
    expect(bloqueEliminar).toContain("revokeRefreshTokens(uid)");
    expect(bloqueEliminar).toContain("deleteUser(uid)");
  });
});
