import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * HALLAZGO (auditoria de operacion en produccion, ago-2026): registro.ts
 * ya define un sistema de auditoria estructurada (auditar/auditarFallo)
 * pensado justamente para poder responder "¿quien borro esto y cuando?"
 * y para poder montar alertas de Cloud Monitoring sobre resultado=error.
 *
 * Pero de los 8 eventos declarados en EventoAuditable, 3 nunca se
 * llamaban desde ningun lado: "contrato_actualizado", "usuario_eliminado"
 * y "password_restablecida" -- el tipo existia, el logging real no. Y
 * eliminarFactura.ts (borrado definitivo de una factura) no tenia
 * NINGUN registro, ni siquiera un evento declarado para el caso.
 *
 * Esto no es una falla de seguridad (los permisos ya estaban bien
 * comprobados) sino un agujero de observabilidad: si mañana alguien
 * pregunta "¿quien restablecio la contraseña de este cliente?" o
 * "¿quien borro esta factura?", la respuesta hoy es "no hay forma de
 * saberlo". Estos tests fijan que cada accion destructiva/sensible deja
 * rastro, usando el mismo patron whitebox que el resto del repo: leen el
 * archivo fuente real y comprueban que el codigo que se ejecuta en
 * produccion (no una reimplementacion) llama a auditar/auditarFallo con
 * el evento correcto.
 */

const FUNCIONES = resolve(__dirname, "../../functions/src");

function leer(archivo: string): string {
  return readFileSync(resolve(FUNCIONES, archivo), "utf-8");
}

describe("registro.ts declara todos los eventos que las Functions usan", () => {
  const codigo = leer("registro.ts");

  it("incluye factura_eliminada en el tipo cerrado EventoAuditable", () => {
    expect(codigo).toMatch(/EventoAuditable\s*=[\s\S]*"factura_eliminada"/);
  });

  it("auditarFallo nunca registra el objeto de error completo (solo el mensaje)", () => {
    // Un objeto de error de Firestore puede arrastrar el contenido de un
    // documento -- si esto se registrara entero, datos de clientes
    // podrian terminar en Cloud Logging, que se trata como menos
    // protegido que la base de datos.
    expect(codigo).toContain("error instanceof Error ? error.message : String(error)");
  });
});

describe("eliminarFactura audita el borrado de facturas", () => {
  const codigo = leer("eliminarFactura.ts");

  it('importa auditar y auditarFallo desde registro.js', () => {
    expect(codigo).toMatch(/import\s*\{\s*auditar,\s*auditarFallo\s*\}\s*from\s*"\.\/registro\.js"/);
  });

  it('registra "factura_eliminada" al borrar con exito', () => {
    expect(codigo).toContain('auditar("factura_eliminada"');
  });

  it('registra el fallo si el borrado no se completa', () => {
    expect(codigo).toContain('auditarFallo("factura_eliminada"');
  });

  it("no registra el pdfUrl/key del archivo, solo el id de la factura y del cliente", () => {
    const llamada = codigo.match(/auditar\("factura_eliminada",\s*\{[^}]*\}\)/)?.[0] ?? "";
    expect(llamada).not.toContain("pdfUrl");
  });
});

describe("restablecerPasswordCliente audita quien restablecio que cuenta", () => {
  const codigo = leer("restablecerPasswordCliente.ts");

  it('registra "password_restablecida" tras cambiar la contraseña', () => {
    expect(codigo).toContain('auditar("password_restablecida"');
  });

  it("el registro ocurre despues de updateUser, no antes (solo se audita lo que de verdad paso)", () => {
    const idxUpdate = codigo.indexOf("await getAuth().updateUser(usuario.uid");
    const idxAuditar = codigo.indexOf('auditar("password_restablecida"');
    expect(idxUpdate).toBeGreaterThan(-1);
    expect(idxAuditar).toBeGreaterThan(idxUpdate);
  });

  it("nunca registra la contraseña generada en el log de auditoria", () => {
    // Se descarta el nombre del evento (contiene "password" a proposito)
    // y se revisa solo el objeto de datos que viaja al log.
    const datos = codigo.match(/auditar\("password_restablecida",\s*(\{[^}]*\})\)/)?.[1] ?? "";
    expect(datos.length).toBeGreaterThan(0);
    expect(datos.toLowerCase()).not.toContain("password");
  });
});

describe("actualizarContrato audita ediciones de campañas", () => {
  const codigo = leer("actualizarContrato.ts");

  it('registra "contrato_actualizado" tras confirmar el cambio', () => {
    expect(codigo).toContain('auditar("contrato_actualizado"');
  });
});

describe("administrarUsuarioPortal audita el borrado definitivo de accesos", () => {
  const codigo = leer("administrarUsuarioPortal.ts");

  it('registra "usuario_eliminado" solo para la accion "eliminar"', () => {
    expect(codigo).toMatch(/if\s*\(accion === "eliminar"\)\s*\{\s*\n\s*auditar\("usuario_eliminado"/);
  });

  it("el registro vive en ejecutarAdministrarUsuarioPortal (cubre tanto al Gerente directo como una solicitud de Trabajador ya aprobada)", () => {
    const idxFuncion = codigo.indexOf("export async function ejecutarAdministrarUsuarioPortal");
    const idxAuditar = codigo.indexOf('auditar("usuario_eliminado"');
    expect(idxFuncion).toBeGreaterThan(-1);
    expect(idxAuditar).toBeGreaterThan(idxFuncion);
  });
});

describe("resolverSolicitudAccion pasa quien aprueba como ejecutor del borrado", () => {
  const codigo = leer("resolverSolicitudAccion.ts");

  it("al ejecutar una solicitud de eliminarUsuario, pasa ejecutadoPor: uid (el Gerente que aprueba)", () => {
    const bloque = codigo.match(/case "eliminarUsuario":[\s\S]*?break;/)?.[0] ?? "";
    expect(bloque).toContain("ejecutadoPor: uid");
  });
});
