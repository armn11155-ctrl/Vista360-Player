import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * HALLAZGO: el rol Trabajador estaba roto de la mitad para abajo.
 *
 * firestore.rules ya deja al Trabajador leer clientes, contratos,
 * facturas e informes (funcion esPersonalDePortal, cambiada a proposito y
 * documentada ahi). Pero tres Cloud Functions seguian preguntando
 * `role === "admin"`, o sea SOLO el Gerente:
 *
 *   firmarUrlsR2          -> sin URLs de facturas ni de imagenes de campaña
 *   firmarDescargaFactura -> no podia descargar ninguna factura
 *   listarReportesCliente -> no podia ni ver la lista de reportes
 *
 * Y como el Trabajador NO tiene clienteId (ver crearTrabajadorAcceso.ts),
 * caia por la rama de cliente y no cumplia ninguna comprobacion de
 * pertenencia: no podia abrir nada. Podia GENERAR un reporte con
 * generarReporteCliente (que si usa esPersonalInterno) y despues no verlo.
 *
 * No era un agujero -- pecaba de restrictivo, que es el lado seguro --
 * pero dejaba el rol inservible justo antes de lanzar.
 */
const FUNCIONES = resolve(__dirname, "../../functions/src");
const leer = (f: string) => readFileSync(resolve(FUNCIONES, f), "utf-8");
const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

describe("el Trabajador puede LEER lo mismo que puede escribir", () => {
  const deberianAceptarTrabajador = [
    "firmarUrlsR2.ts",
    "firmarDescargaFactura.ts",
    "listarReportesCliente.ts",
  ];

  it("las tres funciones de lectura usan esPersonalInterno", () => {
    for (const archivo of deberianAceptarTrabajador) {
      const codigo = sinComentarios(leer(archivo));
      expect(codigo, `${archivo} debe usar esPersonalInterno`).toContain("esPersonalInterno(");
      expect(codigo, `${archivo} no debe volver a comparar con "admin"`).not.toMatch(
        /role\s*===\s*"admin"/
      );
    }
  });

  it("esPersonalInterno incluye al Trabajador y excluye al cliente", () => {
    const roles = sinComentarios(leer("rolesInternos.ts"));
    expect(roles).toContain('role === "admin"');
    expect(roles).toContain('role === "trabajador"');
    expect(roles).toContain("esGerente(role) || esTrabajador(role)");
  });

  it("obtenerArchivoR2Base64 acepta al Trabajador, PERO atado a un recurso real", () => {
    // CAMBIO DE REQUISITO, decidido por el negocio: el Trabajador tambien
    // envia reportes y facturas por Correo/WhatsApp, y esos botones usan
    // esta funcion. Antes esta prueba exigia que fuera solo del Gerente.
    //
    // Abrirla NO puede significar dar acceso general a R2. Lo que la
    // sujeta ahora no es el rol, sino que la key sea un recurso que
    // existe: la ruta debe tener la forma exacta de un reporte (y el
    // cliente existir) o corresponder a una factura con ese pdfUrl.
    // Eso ademas endurece al Gerente, que antes podia pedir cualquier
    // archivo bajo el prefijo.
    const codigo = sinComentarios(leer("obtenerArchivoR2Base64.ts"));
    expect(codigo).toContain("esPersonalInterno(");
    expect(codigo).toContain("FORMATO_REPORTE.exec(key)");
    expect(codigo).toContain('.where("pdfUrl", "==", key)');
  });

  it("red de seguridad: quien FIRME una url de lectura debe aceptar al Trabajador", () => {
    // El invariante exacto, no uno mas ancho.
    //
    // Hay funciones que SI son solo del Gerente a proposito, y lo dicen
    // en su propio mensaje de error: administrarCotizaciones (precios),
    // limpiarArchivosHuerfanos (mantenimiento destructivo),
    // listarAccesosClientes y listarPersonalInterno (gestion de cuentas,
    // igual que portalUsers en las reglas), obtenerEspacioR2 (coste) y
    // obtenerArchivoR2Base64 (bytes de cualquier reporte de cualquier
    // cliente). Reservar ESCRITURAS al Gerente tambien es legitimo.
    //
    // Lo que no puede repetirse es cerrarle al Trabajador la ENTREGA de
    // un archivo que las reglas ya le dejan leer. Esa superficie son las
    // funciones que llaman a firmarLecturaR2.
    const culpables: string[] = [];
    for (const archivo of readdirSync(FUNCIONES).filter((f) => f.endsWith(".ts"))) {
      if (archivo === "r2Storage.ts") continue; // define firmarLecturaR2, no autoriza
      const codigo = sinComentarios(leer(archivo));
      if (!codigo.includes("onCall")) continue;
      if (!codigo.includes("firmarLecturaR2(")) continue;
      if (/role\s*(===|!==)\s*"admin"/.test(codigo)) culpables.push(archivo);
    }
    expect(culpables).toEqual([]);
  });

  it("son exactamente cuatro las funciones que firman lectura", () => {
    // Si aparece una quinta, la red de arriba la cubre sola. Esta prueba
    // existe para que el cambio se note y alguien lo revise.
    const firmantes = readdirSync(FUNCIONES)
      .filter((f) => f.endsWith(".ts") && f !== "r2Storage.ts")
      .filter((f) => sinComentarios(leer(f)).includes("firmarLecturaR2("));
    expect(firmantes.sort()).toEqual([
      "firmarDescargaFactura.ts",
      "firmarUrlsR2.ts",
      "generarReporteCliente.ts",
      "listarReportesCliente.ts",
    ]);
  });

});
