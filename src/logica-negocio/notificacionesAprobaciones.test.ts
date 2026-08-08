import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const solicitudes = readFileSync("functions/src/solicitudesAccion.ts", "utf8");

describe("notificaciones de aprobaciones internas", () => {
  it("avisa al Gerente después de guardar una solicitud del Trabajador", () => {
    const guardar = solicitudes.indexOf('db.collection("solicitudesAccion").add');
    const avisar = solicitudes.indexOf("enviarPushAAdmin");

    expect(guardar).toBeGreaterThan(-1);
    expect(avisar).toBeGreaterThan(guardar);
    expect(solicitudes).toContain("Nuevo panel pendiente de aprobación");
    expect(solicitudes).toContain("Cambio de panel pendiente");
  });

  it("un fallo del push no convierte la solicitud guardada en un error", () => {
    expect(solicitudes).toContain("try {");
    expect(solicitudes).toContain("catch (error)");
    expect(solicitudes.indexOf("return ref.id")).toBeGreaterThan(solicitudes.indexOf("catch (error)"));
  });
});
