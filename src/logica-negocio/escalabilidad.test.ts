import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * BOMBAS DE TIEMPO: coste que crece con la ANTIGÜEDAD del negocio.
 *
 * costeFirestore.test.ts vigila el coste de HOY (no duplicar escuchas,
 * no leer colecciones enteras). Esto vigila otra cosa: consultas cuyo
 * coste crece con los AÑOS aunque el uso diario no cambie.
 *
 * Son las más peligrosas porque no se notan al escribirlas. Una lista
 * "de solicitudes" con diez elementos funciona perfecto; la misma lista
 * a los cinco años tiene miles y se sigue leyendo entera en cada
 * sesión. Para cuando duele, ya está en producción y nadie recuerda por
 * qué se escribió así.
 */

const raiz = resolve(__dirname, "../..");
const HOOKS = resolve(__dirname, "../hooks");
const FUNCIONES = resolve(raiz, "functions/src");

function sinComentarios(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

const solicitudes = sinComentarios(readFileSync(resolve(HOOKS, "useSolicitudesCampana.ts"), "utf-8"));

describe("solicitudes de campaña: el historial no se lee entero", () => {
  it("NUNCA se consulta la colección sin filtrar", () => {
    // Esto era `query(collection(db, "solicitudesCampana"))` a secas.
    // Con 1.000 clientes y cinco años son ~100.000 documentos leídos en
    // cada apertura del admin: el doble de la cuota diaria gratuita
    // gastado por UNA sola sesión.
    expect(solicitudes).not.toMatch(
      /query\(\s*collection\((db|bd)!?,\s*"solicitudesCampana"\)\s*\)/
    );
  });

  it("toda consulta a solicitudesCampana lleva filtro por estado", () => {
    const consultas = solicitudes.match(/collection\((db|bd)!?,\s*"solicitudesCampana"\)/g) ?? [];
    expect(consultas.length).toBeGreaterThan(0);
    // Una consulta por estado: las pendientes y las ya resueltas.
    expect(solicitudes).toContain('where("estado", "==", "Pendiente")');
    expect(solicitudes).toContain('where("estado", "in"');
  });

  it("el historial ya resuelto está acotado por un límite", () => {
    // Las pendientes NO llevan límite a propósito (se vacían solas al
    // resolverlas, y ocultar trabajo sin atender sería peor). Lo que
    // crece para siempre es lo resuelto, y eso sí va acotado.
    expect(solicitudes).toMatch(/limit\(RESUELTAS_VISIBLES\)/);
    const tope = /RESUELTAS_VISIBLES\s*=\s*(\d+)/.exec(solicitudes);
    expect(tope, "RESUELTAS_VISIBLES debe ser un número literal").not.toBeNull();
    expect(Number(tope![1])).toBeGreaterThan(0);
    expect(Number(tope![1])).toBeLessThanOrEqual(200);
  });

  it("las dos escuchas se combinan sin pisarse", () => {
    // Cada onSnapshot llega por su cuenta. Si cada uno hiciera setState
    // con lo suyo, la lista parpadearía perdiendo la mitad de las filas.
    expect(solicitudes).toContain("if (pendientes === null || resueltas === null) return;");
    expect(solicitudes).toMatch(/\[\.\.\.pendientes,\s*\.\.\.resueltas\]/);
  });

  it("se cancelan las DOS escuchas al desmontar", () => {
    // Dejar una viva sigue cobrando cada cambio de la colección.
    expect(solicitudes).toMatch(/unsubPendientes\(\);\s*unsubResueltas\(\);/);
  });
});

describe("las consultas compuestas nuevas tienen su índice declarado", () => {
  const indices = JSON.parse(
    readFileSync(resolve(raiz, "firestore.indexes.json"), "utf-8"),
  ) as { indexes: Array<{ collectionGroup: string; fields: Array<{ fieldPath: string; order?: string }> }> };

  it("existe el índice para: estado + createdAt (solicitudesCampana)", () => {
    // where("estado","in",[...]) + orderBy("createdAt","desc") NO funciona
    // sin este índice: Firestore rechaza la consulta en producción y la
    // pantalla de solicitudes queda en error, aunque todo compile.
    const existe = indices.indexes.some(
      (i) =>
        i.collectionGroup === "solicitudesCampana" &&
        i.fields.length === 2 &&
        i.fields[0].fieldPath === "estado" &&
        i.fields[0].order === "ASCENDING" &&
        i.fields[1].fieldPath === "createdAt" &&
        i.fields[1].order === "DESCENDING",
    );
    expect(existe).toBe(true);
  });
});

describe("las funciones que recorren colecciones enteras declaran su tiempo", () => {
  // Estas cuatro leen colecciones completas o listan el bucket entero.
  // Su coste crece con TODO el histórico. No se puede evitar (son
  // recuentos globales), pero sí se puede evitar que mueran calladas: el
  // valor por defecto son 60 segundos, y al cortarse dejan el resultado
  // a medias sin explicar por qué.
  const PESADAS = [
    "limpiarArchivosHuerfanos",
    "resumenOcupacion",
    "contarEvidenciasHuerfanas",
    "obtenerEspacioR2",
  ];

  for (const nombre of PESADAS) {
    it(`${nombre} fija timeoutSeconds explícitamente`, () => {
      const codigo = sinComentarios(readFileSync(resolve(FUNCIONES, `${nombre}.ts`), "utf-8"));
      const t = /timeoutSeconds:\s*(\d+)/.exec(codigo);
      expect(t, `${nombre} usaría los 60 s por defecto`).not.toBeNull();
      expect(Number(t![1])).toBeGreaterThan(60);
      expect(Number(t![1])).toBeLessThanOrEqual(540);
    });
  }
});

describe("ninguna escucha nueva lee una colección entera en vivo", () => {
  // Red de seguridad para el futuro: cualquier hook que escuche una
  // colección que crece con el tiempo debe filtrarla o acotarla.
  const CRECEN_CON_EL_TIEMPO = ["contratos", "facturas", "informesCliente", "solicitudesCampana"];

  it("todas llevan where() o limit()", () => {
    const culpables: string[] = [];
    for (const f of readdirSync(HOOKS).filter((x) => x.endsWith(".ts") && !x.includes(".test."))) {
      const c = sinComentarios(readFileSync(resolve(HOOKS, f), "utf-8"));
      for (const col of CRECEN_CON_EL_TIEMPO) {
        const re = new RegExp(`query\\(\\s*collection\\(db!?,\\s*"${col}"\\)\\s*[,)]`);
        const m = re.exec(c);
        if (!m) continue;
        // Se mira el trozo de consulta que sigue a la colección.
        const trozo = c.slice(m.index, m.index + 400);
        if (!/where\(|limit\(/.test(trozo)) culpables.push(`${f} -> ${col}`);
      }
    }
    expect(culpables).toEqual([]);
  });
});

describe("respaldo si falta el índice compuesto", () => {
  it("distingue 'falta el índice' de un fallo real", () => {
    // failed-precondition es lo ÚNICO que significa "hay que crear el
    // índice". Un fallo de permisos o de red sí debe verse como error.
    expect(solicitudes).toContain('codigo === "failed-precondition"');
  });

  it("al faltar el índice reintenta SIN el orden, no sin el límite", () => {
    // El índice solo lo exige el orderBy. Reintentar sin límite habría
    // devuelto la bomba de tiempo que este archivo existe para evitar.
    const reintento = solicitudes.slice(solicitudes.indexOf("escucharResueltas(false)"));
    expect(solicitudes).toContain("escucharResueltas(false)");
    expect(reintento.length).toBeGreaterThan(0);
    // Las DOS ramas (con y sin orden) llevan el límite.
    const conLimite = solicitudes.match(/limit\(RESUELTAS_VISIBLES\)/g) ?? [];
    expect(conLimite.length).toBe(2);
    // Solo UNA rama lleva el orden.
    const conOrden = solicitudes.match(/orderBy\("createdAt", "desc"\)/g) ?? [];
    expect(conOrden.length).toBe(1);
  });

  it("el respaldo no puede reintentarse en bucle", () => {
    // escucharResueltas(false) vuelve a este mismo manejador si falla.
    // La guarda `conOrden &&` es lo que impide que se llame a sí mismo
    // para siempre quemando cuota en cada intento.
    expect(solicitudes).toContain("if (conOrden && esFaltaDeIndice(err))");
  });
});

describe("notificaciones del cliente: tampoco leen su historial entero", () => {
  const notif = sinComentarios(readFileSync(resolve(HOOKS, "useNotificaciones.ts"), "utf-8"));

  it("NO se piden todas las solicitudes del cliente", () => {
    // Era where("cliente_id","==",clienteId) a secas, y luego el
    // navegador tiraba casi todo. Un cliente de cinco anios pagaba sus
    // ~100 solicitudes historicas en CADA sesion para mostrar dos.
    const suelta = /query\(\s*collection\(db!?,\s*"solicitudesCampana"\),\s*where\("cliente_id",\s*"==",\s*clienteId\)\s*\)/;
    expect(notif).not.toMatch(suelta);
  });

  it("se piden solo las pendientes y las resueltas recientes", () => {
    expect(notif).toContain('where("estado", "==", "Pendiente")');
    expect(notif).toContain('where("estadoActualizadoEn", ">=", Timestamp.fromDate(hace14))');
  });

  it("el filtro por fecha usa la MISMA ventana que se muestra", () => {
    // Si la consulta trajera mas dias de los que se pintan, se estaria
    // pagando por documentos que se descartan; si trajera menos,
    // desaparecerian notificaciones que el cliente deberia ver.
    expect(notif).toMatch(/hace14 = new Date\(hoyBase\.getTime\(\) - 14 \* 86400000\)/);
  });

  it("una solicitud resuelta hoy no se cuenta dos veces", () => {
    // Sale en las DOS consultas. Sin deduplicar, el contador de
    // notificaciones marcaria de mas.
    expect(notif).toContain("porId.set(d.id, d)");
  });

  it("se cancelan las dos escuchas de solicitudes", () => {
    expect(notif).toMatch(/unsubSolPendientes\(\);\s*unsubSolRecientes\(\);/);
  });

  it("existen los indices de las dos consultas", () => {
    const idx = JSON.parse(readFileSync(resolve(raiz, "firestore.indexes.json"), "utf-8")) as {
      indexes: Array<{ collectionGroup: string; fields: Array<{ fieldPath: string }> }>;
    };
    const tiene = (campos: string[]) =>
      idx.indexes.some(
        (i) =>
          i.collectionGroup === "solicitudesCampana" &&
          i.fields.length === campos.length &&
          i.fields.every((f, n) => f.fieldPath === campos[n]),
      );
    expect(tiene(["cliente_id", "estado"])).toBe(true);
    expect(tiene(["cliente_id", "estadoActualizadoEn"])).toBe(true);
  });
});

describe("campañas: en cada sesión solo se lee lo vigente", () => {
  const contratos = sinComentarios(readFileSync(resolve(HOOKS, "useContratos.ts"), "utf-8"));
  const misCampanas = sinComentarios(
    readFileSync(resolve(__dirname, "../components/screens/MisCampanas.tsx"), "utf-8"),
  );

  it("las campañas se leen del resumen, no una por una", () => {
    // Antes era una lectura por campaña en CADA sesión. Ahora es 1,
    // tenga el cliente dos campañas o doscientas.
    expect(contratos).toContain("`agregados/cliente-${clienteId}`");
  });

  it("el resumen guarda TODAS las campañas y el filtro por fecha va acá", () => {
    // Guardar solo "las vigentes" haría que el documento dependiera del
    // día de hoy: una campaña terminada anoche seguiría saliendo como
    // activa hasta que alguien escribiera algo.
    expect(contratos).toContain('c.fin ?? "") >= hoy');
  });

  it("UNA sola escucha por cliente, compartida", () => {
    // App y Mis campañas piden lo mismo; dos onSnapshot sobre el mismo
    // documento serían dos lecturas.
    expect(contratos).toContain("suscriptores");
    expect(contratos).toContain("if (suscriptores.size === 0) { detener(); clienteActual = \"\"; }");
  });

  it("el historial ya no cuesta ninguna lectura extra", () => {
    // Sale del mismo documento que la sesión ya pagó.
    expect(contratos).toContain("useContratosHistoricos");
    expect(contratos).toMatch(/useResumen\(activo \? clienteId : ""\)/);
  });

  it("Mis campañas pide el historial SOLO en las pestañas que lo enseñan", () => {
    expect(misCampanas).toMatch(
      /quiereHistorial = filtro === "Finalizada" \|\| filtro === "Todas"/,
    );
    expect(misCampanas).toContain('useContratosHistoricos(clienteId ?? "", quiereHistorial)');
  });

  it("no se duplican las campañas al mezclar vigentes con historial", () => {
    // El historial es la misma consulta SIN el filtro de fecha, así que
    // devuelve también las vigentes. Concatenar sin más las mostraría
    // dos veces en la pestaña "Todas".
    expect(misCampanas).toContain("porId.set(c.id, c)");
  });

  it("no se muestra 'no hay campañas' mientras carga el historial", () => {
    expect(misCampanas).toContain("!cargandoHistorial && filtradas.length === 0");
  });

  it("existe el índice contratos(cliente_id, fin)", () => {
    const idx = JSON.parse(readFileSync(resolve(raiz, "firestore.indexes.json"), "utf-8")) as {
      indexes: Array<{ collectionGroup: string; fields: Array<{ fieldPath: string; order?: string }> }>;
    };
    const existe = idx.indexes.some(
      (i) =>
        i.collectionGroup === "contratos" &&
        i.fields.length === 2 &&
        i.fields[0].fieldPath === "cliente_id" &&
        i.fields[1].fieldPath === "fin",
    );
    expect(existe).toBe(true);
  });
});

describe("respaldo si el resumen del cliente no está", () => {
  const contratos = sinComentarios(readFileSync(resolve(HOOKS, "useContratos.ts"), "utf-8"));

  it("cubre las DOS ramas: documento ausente y fallo de la escucha", () => {
    // Cubrir solo una fue exactamente el fallo que dejó Cobertura en
    // blanco en producción. Es LA pantalla principal del cliente.
    const llamadas = (contratos.match(/leerColeccionDirecta\(\);/g) ?? []).length;
    expect(llamadas).toBe(2);
  });

  it("el respaldo lee la colección, no deja la lista vacía", () => {
    expect(contratos).toContain('collection(bd, "contratos")');
    expect(contratos).toContain('where("cliente_id", "==", clienteId)');
  });
});

describe("selector de clientes: sin crecimiento lineal", () => {
  const selector = sinComentarios(readFileSync(resolve(HOOKS, "useClientesAdmin.ts"), "utf-8"));
  const agregado = sinComentarios(readFileSync(resolve(FUNCIONES, "agregadoClientes.ts"), "utf-8"));
  const reglas = readFileSync(resolve(raiz, "firestore.rules"), "utf-8");

  it("el selector NO escucha la colección de clientes por defecto", () => {
    // Era onSnapshot sobre "clientes" entera en cada inicio de sesión.
    // Ahora eso solo puede aparecer dentro del respaldo.
    const antesDelRespaldo = selector.slice(0, selector.indexOf("leerColeccionDirecta"));
    expect(antesDelRespaldo).not.toMatch(/collection\((db|bd)!?,\s*"clientes"\)/);
  });

  it("lee el agregado en partes y sabe cuántas hay", () => {
    expect(selector).toContain('doc(bd, "agregados/clientes-0")');
    expect(selector).toContain("datos!.partes ?? 1");
  });

  it("con pocos clientes es UNA sola lectura", () => {
    // partes <= 1 debe publicar directamente, sin pedir nada más.
    expect(selector).toMatch(/if \(partes <= 1\) \{ publicar\(datos!\.clientes!\); return; \}/);
  });

  it("las partes extra se leen UNA VEZ, no como escuchas en vivo", () => {
    // N escuchas abiertas volverían a cobrar N documentos en cada
    // cambio, que es justo lo que se venía a quitar.
    expect(selector).toContain("getDoc");
    const bloque = selector.slice(selector.indexOf("leerPartesRestantes"));
    expect(bloque.slice(0, 600)).not.toContain("onSnapshot");
  });

  it("si el agregado falta o falla, se lee la colección (no se deja vacío)", () => {
    // Sin esto el admin no podría entrar a NINGUNA cuenta.
    // Las DOS ramas: el documento que no existe y el fallo de la
    // escucha (permiso denegado, red...). Cubrir solo una fue
    // exactamente el fallo que dejó Cobertura en blanco en producción.
    const llamadas = (selector.match(/leerColeccionDirecta\(\);/g) ?? []).length;
    expect(llamadas).toBe(2);
  });

  it("el agregado se reparte en partes por el límite de 1 MB", () => {
    const tope = /CLIENTES_POR_PARTE = (\d+)/.exec(agregado);
    expect(tope).not.toBeNull();
    const n = Number(tope![1]);
    expect(n).toBeGreaterThan(0);
    // ~250 bytes por cliente: por encima de ~4.000 se acerca al límite.
    expect(n).toBeLessThanOrEqual(4000);
  });

  it("el conteo de campañas activas no lee el historial cerrado", () => {
    expect(agregado).toContain('.where("fin", ">=", hoy)');
  });

  it("el agregado nunca hace fallar la operación que lo dispara", () => {
    // Si regenerarlo revienta, crear un cliente NO puede fallar.
    expect(agregado).toContain("catch (error)");
    expect(agregado).not.toContain("throw");
  });

  it("se borran las partes sobrantes al reducirse los clientes", () => {
    expect(agregado).toContain("lote.delete(db.doc(rutaParte(i)))");
  });

  it("REGLAS: la lista de clientes NO la puede leer un cliente", () => {
    // La regla vieja era `allow read: if esCuentaDePortal()` para TODO
    // agregados. Con la lista de clientes dentro, eso dejaría que
    // cualquier cliente leyera los nombres de todos los demás.
    expect(reglas).not.toMatch(/match \/agregados\/\{documento\} \{\s*allow read: if esCuentaDePortal\(\);/);
    expect(reglas).toContain("documento.matches('clientes-[0-9]+') && esPersonalDePortal()");
  });

  it("REGLAS: personal interno incluye al Trabajador, no solo al Gerente", () => {
    // esAdminPortal() exige role == 'admin'. Un Trabajador se quedaría
    // sin poder abrir su propia pantalla de inicio.
    expect(reglas).toMatch(/function esPersonalDePortal\(\)/);
    expect(reglas).toContain("data.role in ['admin', 'trabajador']");
  });

  it("REGLAS: un cliente solo puede leer SU propio resumen", () => {
    // El id va en la RUTA del documento y se compara contra el clienteId
    // que consta en portalUsers, no contra nada que mande el navegador:
    // cambiar la URL no sirve de nada.
    expect(reglas).toContain("documento == 'cliente-' + clienteIdDelPortal()");
    // Y NO puede ser un `esCuentaDePortal()` suelto: eso dejaría a
    // cualquier cliente leer el resumen de cualquier otro.
    const bloque = reglas.slice(reglas.indexOf("documento.matches('cliente-.*')"));
    expect(bloque.slice(0, 300)).toContain("clienteIdDelPortal()");
  });

  it("REGLAS: agregados sigue cerrado a escritura desde el navegador", () => {
    const inicio = reglas.indexOf("match /agregados/");
    const bloque = reglas.slice(inicio, reglas.indexOf("match /", inicio + 20));
    expect(bloque).toContain("allow write: if false;");
  });
});

describe("el agregado del selector se regenera desde TODOS los sitios que lo invalidan", () => {
  // Sin disparadores de Firestore (no se pueden desplegar en este
  // proyecto), la unica garantia es llamar a mano desde cada sitio. Este
  // test es esa garantia: si alguien anade una funcion que toca clientes
  // o contratos y se olvida, falla acá y no en producción semanas
  // después con el selector mostrando datos viejos.
  const OBLIGATORIAS = [
    "crearClienteNuevo",
    "actualizarClienteInfo",
    "administrarClienteAdmin",
    "actualizarAvatarCliente",
    "crearContrato",
    "actualizarContrato",
    "eliminarContrato",
    "sincronizarEstadoPaneles",
  ];

  for (const nombre of OBLIGATORIAS) {
    it(`${nombre} regenera el agregado`, () => {
      const codigo = readFileSync(resolve(FUNCIONES, `${nombre}.ts`), "utf-8");
      expect(codigo).toContain("regenerarAgregadoClientes(db)");
    });
  }

  it("el barrido DIARIO lo regenera (el conteo depende de la fecha)", () => {
    // Una campaña programada pasa a activa sin que nadie escriba nada.
    // Sin esto el contador se congela hasta el siguiente cambio manual.
    const sync = readFileSync(resolve(FUNCIONES, "sincronizarEstadoPaneles.ts"), "utf-8");
    expect(sync).toContain("regenerarAgregadoClientes(db)");
  });
});

describe("el resumen por cliente se regenera desde TODOS los sitios que lo invalidan", () => {
  const OBLIGATORIAS = ["crearContrato", "actualizarContrato", "eliminarContrato"];
  for (const nombre of OBLIGATORIAS) {
    it(`${nombre} regenera el resumen del cliente`, () => {
      expect(readFileSync(resolve(FUNCIONES, `${nombre}.ts`), "utf-8")).toContain(
        "regenerarResumenCliente(db,",
      );
    });
  }

  it("el barrido diario los reconstruye todos (red de seguridad)", () => {
    expect(readFileSync(resolve(FUNCIONES, "sincronizarEstadoPaneles.ts"), "utf-8")).toContain(
      "regenerarResumenesDeTodos(db)",
    );
  });

  it("las solicitudes NO entran en el resumen", () => {
    // Se actualizan directamente desde el navegador del admin, sin pasar
    // por ninguna función: un resumen que las incluyera se quedaría
    // desfasado en cuanto marcara una como revisada, sin forma de
    // enterarse. Si algún día se cierra ese camino, se podrán añadir.
    const agregado = readFileSync(resolve(FUNCIONES, "agregadoCliente.ts"), "utf-8");
    expect(agregado).not.toContain('collection("solicitudesCampana")');
  });

  it("el resumen nunca hace fallar la operación que lo dispara", () => {
    const agregado = sinComentarios(readFileSync(resolve(FUNCIONES, "agregadoCliente.ts"), "utf-8"));
    expect(agregado).toContain("catch (error)");
    expect(agregado).not.toContain("throw");
  });

  it("avisa antes de acercarse al límite de 1 MB", () => {
    const agregado = readFileSync(resolve(FUNCIONES, "agregadoCliente.ts"), "utf-8");
    expect(agregado).toMatch(/AVISO_CONTRATOS = \d+/);
    expect(agregado).toContain("console.warn");
  });
});

describe("el historial de solicitudes solo se carga donde se muestra", () => {
  const hook = sinComentarios(readFileSync(resolve(HOOKS, "useSolicitudesCampana.ts"), "utf-8"));
  const picker = sinComentarios(
    readFileSync(resolve(__dirname, "../components/AdminClientPicker.tsx"), "utf-8"),
  );
  const app = sinComentarios(readFileSync(resolve(__dirname, "../App.tsx"), "utf-8"));
  const pantalla = sinComentarios(
    readFileSync(resolve(__dirname, "../components/screens/SolicitudesCampana.tsx"), "utf-8"),
  );

  it("existe un hook que trae SOLO las pendientes", () => {
    expect(hook).toContain("export function useSolicitudesPendientes");
    const bloque = hook.slice(hook.indexOf("useSolicitudesPendientes"), hook.indexOf("export function useSolicitudesCampana"));
    // El barato NO puede pedir las resueltas.
    expect(bloque).not.toContain("ESTADOS_RESUELTOS");
    expect(bloque).toContain('where("estado", "==", "Pendiente")');
  });

  it("el contador del selector usa el hook barato", () => {
    // El badge es un número. Cargar las 50 resueltas para pintarlo eran
    // 50 documentos por cada inicio de sesión.
    expect(picker).toContain("useSolicitudesPendientes(true)");
    expect(picker).not.toContain("useSolicitudesCampana(");
  });

  it("el contador de la barra lateral también", () => {
    expect(app).toContain("useSolicitudesPendientes(!!isAdmin)");
    expect(app).not.toContain("useSolicitudesCampana(");
  });

  it("la pantalla de Solicitudes SÍ carga el historial", () => {
    // Ahí es donde de verdad se enseña; quitarlo sería romperla.
    expect(pantalla).toContain("useSolicitudesCampana(true)");
  });

  it("el contador sigue siendo en vivo", () => {
    // Se podría haber usado una consulta de conteo (1 lectura), pero
    // dejaría de actualizarse solo al llegar una solicitud nueva. Las
    // pendientes son pocas por naturaleza: se vacían al atenderlas.
    const bloque = hook.slice(hook.indexOf("useSolicitudesPendientes"), hook.indexOf("export function useSolicitudesCampana"));
    expect(bloque).toContain("onSnapshot");
  });
});
