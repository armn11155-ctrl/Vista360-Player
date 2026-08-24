import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const solicitudes = readFileSync("functions/src/solicitudesAccion.ts", "utf8");
const factura = readFileSync("functions/src/crearFacturaAdmin.ts", "utf8");
const campana = readFileSync("functions/src/crearSolicitudCampana.ts", "utf8");
const resolucion = readFileSync("functions/src/actualizarEstadoSolicitud.ts", "utf8");
const indice = readFileSync("functions/src/index.ts", "utf8");
const pushNavegador = readFileSync("src/utils/pushNotifications.ts", "utf8");
const workflow = readFileSync(".github/workflows/setup-r2-secrets-and-deploy.yml", "utf8");

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

  it("el workflow tampoco intenta desplegar triggers retirados", () => {
    expect(workflow).not.toContain("functions:notificarFacturaNueva");
    expect(workflow).not.toContain("functions:notificarSolicitudCampana");
    expect(workflow).not.toContain("functions:notificarResolucionSolicitud");
    expect(workflow).not.toContain("functions:notificarReporteListo");
  });

  it("pide el permiso de Safari dentro del clic antes de cualquier espera asíncrona", () => {
    const leerPermiso = pushNavegador.indexOf("const permisoActual = estadoPermisoNotificaciones()");
    const pedirPermiso = pushNavegador.indexOf("await Notification.requestPermission()", leerPermiso);
    const comprobarSoporte = pushNavegador.indexOf("await pushDisponible()", leerPermiso);

    expect(leerPermiso).toBeGreaterThan(-1);
    expect(pedirPermiso).toBeGreaterThan(leerPermiso);
    expect(comprobarSoporte).toBeGreaterThan(pedirPermiso);
    expect(pushNavegador).toContain('permisoActual === "granted"');
  });
});
