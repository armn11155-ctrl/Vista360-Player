import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const solicitudes = readFileSync("functions/src/solicitudesAccion.ts", "utf8");
const factura = readFileSync("functions/src/crearFacturaAdmin.ts", "utf8");
const campana = readFileSync("functions/src/crearSolicitudCampana.ts", "utf8");
const resolucion = readFileSync("functions/src/actualizarEstadoSolicitud.ts", "utf8");
const indice = readFileSync("functions/src/index.ts", "utf8");

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

  it("manda los avisos operativos desde las funciones que ya guardan los datos", () => {
    expect(factura).toContain("enviarPushACliente");
    expect(campana).toContain("enviarPushAAdmin");
    expect(resolucion).toContain("enviarPushACliente");
  });

  it("no vuelve a exportar triggers de Eventarc que no pueden desplegarse", () => {
    expect(indice).not.toContain("notificarFacturaNueva");
    expect(indice).not.toContain("notificarSolicitudCampana");
    expect(indice).not.toContain("notificarResolucionSolicitud");
    expect(indice).not.toContain("notificarReporteListo");
  });
});
