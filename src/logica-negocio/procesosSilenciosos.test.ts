import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * INVENTARIO DE PROCESOS QUE CORREN SOLOS.
 *
 * Un proceso periódico que se para es el fallo más caro de descubrir: la
 * aplicación sigue funcionando perfectamente y los datos se degradan
 * despacio, durante semanas, hasta que alguien lo nota por casualidad.
 *
 * Este archivo hace dos cosas:
 *  1. Fija que cada tarea periódica DEJA CONSTANCIA de que corrió, y que
 *     hay un guardián que la vigila.
 *  2. Deja escrito, para cada proceso que se decidió NO vigilar, POR QUÉ
 *     no hace falta -- para que sea una decisión revisable y no un
 *     olvido.
 *
 * Si alguien añade una tarea periódica nueva y no la registra, el primer
 * test falla.
 */

const RAIZ = resolve(__dirname, "../..");
const FUNCIONES = resolve(RAIZ, "functions/src");
const leer = (p: string) => readFileSync(resolve(RAIZ, p), "utf-8");

describe("toda tarea periódica deja constancia de que corrió", () => {
  it("NO hay ninguna tarea programada sin latido", () => {
    // Se buscan los onSchedule que existan, no una lista escrita a mano:
    // así una tarea nueva queda cubierta sola.
    const conSchedule: string[] = [];
    for (const archivo of readdirSync(FUNCIONES).filter((f) => f.endsWith(".ts"))) {
      const codigo = readFileSync(resolve(FUNCIONES, archivo), "utf-8");
      for (const m of codigo.matchAll(/export const (\w+) = onSchedule/g)) {
        conSchedule.push(m[1]);
      }
    }
    expect(conSchedule.length).toBeGreaterThan(0);

    const sinLatido = conSchedule.filter((nombre) => {
      const codigo = readdirSync(FUNCIONES)
        .filter((f) => f.endsWith(".ts"))
        .map((f) => readFileSync(resolve(FUNCIONES, f), "utf-8"))
        .find((c) => c.includes(`export const ${nombre} = onSchedule`))!;
      const desde = codigo.indexOf(`export const ${nombre} = onSchedule`);
      const trozo = codigo.slice(desde, desde + 1200);
      return !trozo.includes(`latir(db, "${nombre}")`);
    });
    expect(sinLatido).toEqual([]);
  });

  it("el barrido diario también late", () => {
    expect(leer("functions/src/sincronizarEstadoPaneles.ts")).toContain(
      'latir(db, "sincronizarEstadoPaneles")',
    );
  });

  it("el latido va al PRINCIPIO de las tareas de avisos", () => {
    // Lo que se vigila es que la tarea se EJECUTE. La mayoría de los días
    // no hay nada que enviar, y una tarea que corre sin encontrar trabajo
    // está sana. Ponerlo al final la daría por muerta.
    const push = leer("functions/src/notificacionesPush.ts");
    for (const tarea of ["recordatorioReportesMensuales", "recordatorioVencimientoCampanas"]) {
      const desde = push.indexOf(`export const ${tarea} = onSchedule`);
      // La ventana tiene que ser generosa: recordatorioReportesMensuales
      // hace bastante aritmética de fechas antes de tocar Firestore.
      const cuerpo = push.slice(desde, desde + 4000);
      const posLatido = cuerpo.indexOf(`latir(db, "${tarea}")`);
      expect(posLatido, `${tarea} no late`).toBeGreaterThan(-1);

      const posTrabajo = cuerpo.search(/\.collection\(|\.get\(\)|return;/);
      expect(posTrabajo, `no se encontró trabajo en ${tarea}`).toBeGreaterThan(-1);
      expect(posLatido, `${tarea} late demasiado tarde`).toBeLessThan(posTrabajo);
    }
  });

  it("anotar el latido NUNCA puede tumbar la tarea", () => {
    // Si el guardián rompiera la tarea, estaría causando el fallo que
    // vino a detectar.
    const latido = leer("functions/src/latidoDeTareas.ts");
    expect(latido).toContain("catch (error)");
    expect(latido).not.toContain("throw");
  });

  it("el guardián del frontend vigila TODAS las tareas registradas", () => {
    const latido = leer("functions/src/latidoDeTareas.ts");
    const hook = leer("src/hooks/useTareasPeriodicas.ts");
    const declaradas = [...latido.matchAll(/\| "(\w+)"/g)].map((m) => m[1]);
    expect(declaradas.length).toBeGreaterThanOrEqual(3);
    for (const tarea of declaradas) {
      expect(hook, `${tarea} no está vigilada en el frontend`).toContain(tarea);
    }
  });

  it("REGLAS: el documento de latidos solo lo lee personal interno", () => {
    expect(leer("firestore.rules")).toContain("documento == 'tareas' && esPersonalDePortal()");
  });
});

/**
 * Los procesos que se revisaron y NO llevan guardián, con el motivo.
 * Cada `it` es un acta: si alguien discrepa, tiene dónde discutirlo.
 */
describe("procesos revisados que NO necesitan guardián", () => {
  it("regeneración de agregados al escribir: su fallo es RUIDOSO, no silencioso", () => {
    // El admin lee EXACTAMENTE el mismo documento que el cliente. Si al
    // crear una campaña la regeneración falla, el admin ve que su campaña
    // no aparece -- inmediatamente y sin ambigüedad. No hace falta
    // vigilar lo que ya se ve solo.
    const contratos = leer("src/hooks/useContratos.ts");
    expect(contratos).toContain("`agregados/cliente-${clienteId}`");
    const crear = leer("functions/src/crearContrato.ts");
    expect(crear).toContain("regenerarResumenCliente(db,");
  });

  it("caché de URLs firmadas: caduca sola, con margen", () => {
    // Se renuevan 30 minutos antes de expirar y al cargar se descartan
    // las vencidas. Su fallo se ve al instante: la imagen no carga.
    const urls = leer("src/hooks/useSignedUrls.ts");
    expect(urls).toMatch(/MARGEN_MS\s*=/);
    expect(urls).toContain("expiraEn > ahora");
  });

  it("caché de la aplicación: ya tiene tres mecanismos", () => {
    // Versión de caché, aviso a las pestañas abiertas, reintento con
    // limpieza al cargar una pantalla, y recarga si una transición no
    // termina. Un guardián más sería el quinto para lo mismo.
    const sw = leer("public/sw.js");
    expect(sw).toMatch(/const CACHE = "v360player-shell-v\d+"/);
    expect(sw).toContain('cliente.postMessage({ tipo: "version-nueva" })');
    expect(leer("src/utils/pantallaLazy.ts")).toContain("limpiarCacheDelServiceWorker");
  });

  it("limpieza de archivos huérfanos: manual, y no acumular cuesta centavos", () => {
    // No es periódica ni lo debe ser: recorre seis colecciones enteras y
    // el bucket completo. Que no se ejecute solo significa pagar unos
    // centavos de almacenamiento en R2.
    const limpiar = leer("functions/src/limpiarArchivosHuerfanos.ts");
    expect(limpiar).toContain("onCall");
    expect(limpiar).not.toContain("onSchedule");
  });

  it("recálculo del estado de paneles: su fallo también se ve", () => {
    // Corre dentro de crear/editar/eliminar campaña. Si falla, el panel
    // queda con el estado equivocado y quien hizo el cambio lo tiene
    // delante en Cobertura.
    expect(leer("functions/src/estadoPaneles.ts")).toContain("recalcularEstadoPaneles");
  });

  it("registro de accesos y visitas: perderlo no degrada nada", () => {
    // Son contadores de analítica. Si dejaran de escribirse, se pierde
    // una estadística; no hay ningún dato ni comportamiento que se
    // corrompa. No merece una comprobación en cada sesión.
    expect(leer("functions/src/registrarAcceso.ts")).toContain("lastLoginCount");
  });
});

/**
 * COHERENCIA ENTRE LAS REGLAS Y LAS CLOUD FUNCTIONS.
 *
 * Son dos sistemas de permisos distintos que tienen que decir lo mismo.
 * Cuando se desalinean no salta ningún error: simplemente un rol puede
 * escribir algo que no puede leer, o al revés. Eso fue exactamente lo
 * que le pasó al Trabajador -- podía crear una campaña y no verla.
 */
describe("los tres roles pueden hacer su trabajo, y nada más", () => {
  const reglas = leer("firestore.rules");

  it("un Trabajador puede LEER lo que las funciones le dejan ESCRIBIR", () => {
    // crearContrato/actualizarContrato/crearClienteNuevo usan
    // esPersonalInterno, así que aceptan a un Trabajador. Las reglas
    // tienen que dejarle leer esas mismas colecciones.
    for (const coleccion of ["clientes", "contratos", "informesCliente", "solicitudesCampana"]) {
      const inicio = reglas.indexOf(`match /${coleccion}/`);
      expect(inicio, `no existe la regla de ${coleccion}`).toBeGreaterThan(-1);
      const bloque = reglas.slice(inicio, reglas.indexOf("match /", inicio + 20));
      expect(bloque, `${coleccion} sigue cerrada al Trabajador`).toContain("esPersonalDePortal()");
    }
  });

  it("la gestión de CUENTAS sigue siendo solo del Gerente", () => {
    // Coherente con las funciones: crearTrabajadorAcceso,
    // administrarUsuarioPortal y restablecerPassword son solo del
    // Gerente. Leer las fichas de otros también debe serlo.
    for (const coleccion of ["portalUsers", "invitacionesPortal"]) {
      const inicio = reglas.indexOf(`match /${coleccion}/`);
      const bloque = reglas.slice(inicio, reglas.indexOf("match /", inicio + 20));
      expect(bloque, `${coleccion} se abrió al Trabajador`).not.toContain("esPersonalDePortal()");
      expect(bloque).toContain("esAdminPortal()");
    }
  });

  it("NINGÚN rol puede escribir desde el navegador", () => {
    // Toda escritura pasa por Cloud Functions, que revalidan el rol con
    // el Admin SDK. Es lo que permite que las reglas sean tan simples.
    const escrituras = [...reglas.matchAll(/allow (write|create|update|delete)[^;]*;/g)]
      .map((m) => m[0])
      .filter((linea) => !/if false/.test(linea));
    expect(escrituras).toEqual([]);
  });

  it("un cliente sigue viendo SOLO lo suyo", () => {
    // Las tres puertas por las que un cliente llega a sus datos comparan
    // siempre contra portalUsers, nunca contra algo que mande él.
    expect(reglas).toContain("resource.data.cliente_id == clienteIdDelPortal()");
    expect(reglas).toContain("id == clienteIdDelPortal()");
    expect(reglas).toContain("documento == 'cliente-' + clienteIdDelPortal()");
  });
});
