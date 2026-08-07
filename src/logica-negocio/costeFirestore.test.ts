import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Vigilancia del COSTE de Firestore.
 *
 * En Firebase se paga por documento leído, y las escuchas en vivo
 * (onSnapshot) cobran la carga inicial y otra vez con cada cambio. Con
 * pocos clientes no se nota; con muchos, un listener de más o una
 * consulta sin filtro se convierten en la mayor parte de la factura.
 *
 * Estos tests no miden el gasto -- fijan las decisiones que lo
 * contienen, para que no se deshagan sin querer. Es el tipo de cosa que
 * se degrada sola: alguien añade un hook que "solo necesita los
 * contratos" y duplica una escucha que ya existía.
 */

const HOOKS = resolve(__dirname, "../hooks");

function hook(nombre: string): string {
  return readFileSync(resolve(HOOKS, `${nombre}.ts`), "utf-8");
}

/** Código sin comentarios: varios explican optimizaciones pasadas y
 *  mencionan las consultas que precisamente ya NO se hacen. */
function sinComentarios(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

describe("no duplicar escuchas sobre la misma colección", () => {
  it("solo UN hook escucha los contratos de un cliente", () => {
    // useNotificaciones tenía su propia escucha con la MISMA consulta
    // que useContratos: cada sesión leía las campañas dos veces, y las
    // volvía a pagar dos veces con cada cambio.
    const conEscuchaDeContratos = readdirSync(HOOKS)
      .filter((f) => f.endsWith(".ts") && !f.includes(".test."))
      .filter((f) => {
        const c = sinComentarios(readFileSync(resolve(HOOKS, f), "utf-8"));
        return /collection\((db|bd)!?,\s*"contratos"\)/.test(c) && /where\("cliente_id"/.test(c);
      });
    expect(conEscuchaDeContratos).toEqual(["useContratos.ts"]);
  });

  it("useNotificaciones recibe los contratos, no los consulta", () => {
    const c = sinComentarios(hook("useNotificaciones"));
    expect(c).toContain("contratos: Contrato[]");
    expect(c).not.toMatch(/collection\((db|bd)!?,\s*"contratos"\)/);
  });
});

describe("ninguna escucha lee una colección entera sin filtrar", () => {
  const SIN_FILTRO_ACEPTABLE = new Set([
    // El inventario de paneles es global y acotado por el negocio (son
    // los soportes físicos que existen), no crece con clientes ni años.
    "usePanelesDisponibles.ts",
  ]);

  it("las escuchas sobre colecciones que crecen llevan filtro", () => {
    const sinFiltro: string[] = [];
    for (const f of readdirSync(HOOKS).filter((x) => x.endsWith(".ts") && !x.includes(".test."))) {
      if (SIN_FILTRO_ACEPTABLE.has(f)) continue;
      const c = sinComentarios(readFileSync(resolve(HOOKS, f), "utf-8"));
      // onSnapshot(collection(...)) directo, sin query() alrededor.
      if (/onSnapshot\(\s*collection\((db|bd)!?,\s*"(contratos|facturas|informesCliente|solicitudesCampana)"\)/.test(c)) {
        sinFiltro.push(f);
      }
    }
    expect(sinFiltro).toEqual([]);
  });

  it("el conteo de campañas activas ya no se calcula en el navegador", () => {
    // useCampanasActivasPorCliente escuchaba los contratos de TODOS los
    // clientes para contar los activos de hoy. Con 1.000 clientes eran
    // ~2.000 documentos en cada inicio de sesión del admin. Ahora el
    // conteo viene ya hecho dentro del agregado del selector, así que
    // ese hook se eliminó: si alguien lo recrea, este test lo dice.
    expect(existsSync(resolve(HOOKS, "useCampanasActivasPorCliente.ts"))).toBe(false);
    const selector = sinComentarios(hook("useClientesAdmin"));
    expect(selector).toContain("campanasActivas");
  });
});

describe("las listas del administrador no crecen sin techo", () => {
  it("la lista de invitaciones sigue acotada", () => {
    expect(sinComentarios(hook("useInvitaciones"))).toMatch(/limit\(\d+\)/);
  });
});

describe("facturas: una sola consulta, no dos", () => {
  it("useFacturas ya no consulta por RUC", () => {
    // Antes lanzaba DOS escuchas (por cliente_doc y por cliente_id) y
    // fusionaba quitando duplicados: cada factura se leía y se pagaba
    // dos veces. Verificado contra los datos reales que la consulta por
    // RUC no aportaba ninguna factura que la otra no trajera ya.
    const c = sinComentarios(hook("useFacturas"));
    expect(c).not.toContain('where("cliente_doc"');
    expect(c).toContain('where("cliente_id", "==", clienteId)');
  });

  it("solo hay UNA escucha activa sobre facturas a la vez", () => {
    // Ahora hay dos onSnapshot en el archivo: el del resumen y el del
    // respaldo. Nunca corren a la vez -- el respaldo solo se monta desde
    // las ramas de "no existe" y "fallo". Lo que este test protege es
    // que la escucha del respaldo NO se arranque incondicionalmente.
    const c = sinComentarios(hook("useFacturas"));
    expect((c.match(/onSnapshot\(/g) ?? []).length).toBe(2);
    // La del respaldo vive DENTRO de leerColeccionDirecta, no suelta.
    const respaldo = c.slice(c.indexOf("const leerColeccionDirecta"));
    expect(respaldo.slice(0, 400)).toContain("onSnapshot(");
    // Y solo se llama desde las dos ramas de fallo.
    expect((c.match(/leerColeccionDirecta\(\);/g) ?? []).length).toBe(2);
  });
});

describe("reutilizar lo que ya está en memoria", () => {
  it("Detalle, Facturas y Perfil comparten el agregado reciente de facturas", () => {
    const c = sinComentarios(hook("useFacturas"));
    expect(c).toContain("CACHE_FACTURAS");
    expect(c).toContain("VIGENCIA_FACTURAS_MS");
    expect(c).toContain("setTimeout(iniciarEscucha");
  });

  it("la firma de URLs valida todas las facturas con un solo agregado", () => {
    const c = sinComentarios(
      readFileSync(resolve(__dirname, "../../functions/src/firmarUrlsR2.ts"), "utf-8")
    );
    expect(c).toContain("keysDeMisFacturas");
    expect(c).toContain('`agregados/facturas-${clienteIdPropio}`');
    expect(c).toContain("necesitaCampanas ? keysDeMisCampanas()");
    expect(c).not.toContain("facturaEsDelCliente");
  });

  it("acciones repetidas reutilizan marcado de reporte y firma de descarga", () => {
    const reporte = sinComentarios(
      readFileSync(resolve(__dirname, "../components/ReportCard.tsx"), "utf-8")
    );
    const factura = sinComentarios(
      readFileSync(resolve(__dirname, "../components/FacturaCard.tsx"), "utf-8")
    );
    expect(reporte).toContain("REPORTES_MARCADOS_EN_SESION");
    expect(factura).toContain("CACHE_DESCARGAS");
    expect(factura).toContain("VIGENCIA_DESCARGA_MS");
  });

  it("usePaneles se sirve del inventario cargado antes de pedir a Firestore", () => {
    // La app carga el inventario completo al arrancar (1 lectura). Antes
    // este hook lo ignoraba y pedía cada panel por separado: en una
    // sesión normal, 8 lecturas para datos que ya estaban delante.
    const c = sinComentarios(hook("usePaneles"));
    expect(c).toContain("panelesEnMemoria()");
    expect(c).toContain("faltan");
  });

  it("...pero sigue pudiendo pedir los que falten (no se rompe si no está en memoria)", () => {
    const c = sinComentarios(hook("usePaneles"));
    expect(c).toContain("getDoc(");
  });

  it("el inventario se lee de UN documento agregado, no de la colección", () => {
    const c = sinComentarios(hook("usePanelesDisponibles"));
    expect(c).toContain('doc(db!, "agregados", "paneles")');
  });

  it("...con respaldo a la colección si ese documento aún no existe", () => {
    const c = sinComentarios(hook("usePanelesDisponibles"));
    expect(c).toContain("escucharColeccionDirecta");
  });

  it("Analítica reutiliza los nombres del selector y no lee clientes completos", () => {
    const c = sinComentarios(hook("useAccesosClientes"));
    expect(c).toContain("clientesAdminEnMemoria()");
    expect(c).toContain('doc(db, "agregados/clientes-0")');
    expect(c).not.toMatch(/getDocs\(collection\((db|bd)!?,\s*"clientes"\)\)/);
  });

  it("Analítica deduplica y cachea aperturas repetidas", () => {
    const c = sinComentarios(hook("useAccesosClientes"));
    expect(c).toContain("VIGENCIA_CACHE_MS");
    expect(c).toContain("cargaEnCurso");
  });

  it("Cambiar cliente reutiliza la lista mientras el listener refresca detrás", () => {
    const c = sinComentarios(hook("useClientesAdmin"));
    expect(c).toContain('CLIENTES_EN_MEMORIA\n      ? { status: "ready"');
    expect(c).toContain("CAMPANAS_EN_MEMORIA");
  });

  it("el selector solo firma avatares que la paginación muestra", () => {
    const c = sinComentarios(
      readFileSync(resolve(__dirname, "../components/AdminClientPicker.tsx"), "utf-8"),
    );
    expect(c).toContain("const keysR2 = clientesMostrados");
    expect(c).not.toContain("const keysR2 = clientes\n");
  });

  it("Reportes no vuelve a listar R2 en cada montaje", () => {
    const c = sinComentarios(hook("useInformes"));
    expect(c).toContain("VIGENCIA_LISTADO_MS");
    expect(c).toContain("PETICIONES");
  });

  it("Detalle no carga ni vuelve a firmar reportes mientras muestra Resumen", () => {
    const c = sinComentarios(
      readFileSync(resolve(__dirname, "../components/screens/DetalleCampana.tsx"), "utf-8")
    );
    expect(c).toContain('useInformes(tab === "reportes" ? contrato.cliente_id : "")');
    expect(c).not.toContain("useSignedUrls(");
  });

  it("Inicio pide solo el resumen y no precarga documentos ni URLs de reportes", () => {
    const inicio = sinComentarios(readFileSync(resolve(__dirname, "../components/screens/Inicio.tsx"), "utf-8"));
    const resumen = sinComentarios(hook("useResumenInformes"));
    const funcion = sinComentarios(
      readFileSync(resolve(__dirname, "../../functions/src/listarReportesCliente.ts"), "utf-8")
    );
    expect(inicio).toContain("useResumenInformes(clienteId, mesActual)");
    expect(inicio).not.toContain("useInformes(clienteId)");
    expect(resumen).toContain("resumen: true");
    expect(sinComentarios(hook("useInformes"))).toContain("invalidarResumenInformes(clienteId)");
    expect(funcion).toContain("if (request.data?.resumen === true)");
    expect(funcion.indexOf("if (request.data?.resumen === true)")).toBeLessThan(
      funcion.indexOf("const informes: InformeListado[] = await Promise.all")
    );
  });

  it("Reportes lee metadatos por año y mantiene el agregado en cada mutación", () => {
    const listar = sinComentarios(
      readFileSync(resolve(__dirname, "../../functions/src/listarReportesCliente.ts"), "utf-8")
    );
    const generar = sinComentarios(
      readFileSync(resolve(__dirname, "../../functions/src/generarReporteCliente.ts"), "utf-8")
    );
    const marcar = sinComentarios(
      readFileSync(resolve(__dirname, "../../functions/src/marcarReporteVisto.ts"), "utf-8")
    );
    const eliminar = sinComentarios(
      readFileSync(resolve(__dirname, "../../functions/src/eliminarReporteCliente.ts"), "utf-8")
    );
    expect(listar).toContain("rutaResumenInformes(clienteId, anio)");
    expect(listar).toContain("datos?.completo");
    expect(listar).toContain("metadataPorId.get(idKey)");
    expect(generar).toContain("guardarMetadataInforme(db, clienteId, fecha");
    expect(marcar).toContain("guardarMetadataInforme(db, clienteId");
    expect(eliminar).toContain("eliminarMetadataInforme(db, clienteId");
  });

  it("Ocupación no repite el cruce de colecciones al reentrar", () => {
    const c = sinComentarios(hook("useOcupacion"));
    expect(c).toContain("VIGENCIA_OCUPACION_MS");
    expect(c).toContain("ocupacionEnCurso");
  });

  it("Mi perfil no recorre el bucket R2 en cada montaje", () => {
    const c = sinComentarios(
      readFileSync(resolve(__dirname, "../components/screens/AdminPerfil.tsx"), "utf-8"),
    );
    expect(c).toContain("VIGENCIA_ESPACIO_MS");
    expect(c).toContain("espacioR2EnCurso");
  });

  it("Cotizaciones carga jsPDF solo cuando se genera el archivo", () => {
    const c = sinComentarios(
      readFileSync(resolve(__dirname, "../components/screens/Cotizaciones.tsx"), "utf-8"),
    );
    expect(c).not.toContain('import { generarCotizacionPdf } from');
    expect(c).toContain('await import("../../utils/cotizacionPdf")');
  });

  it("los contadores de visita no generan lecturas del listener de autenticación", () => {
    const c = sinComentarios(hook("usePortalAuth"));
    expect(c).toContain("getDoc(");
    expect(c).not.toContain("onSnapshot(");
    expect(c).toContain('document.addEventListener("visibilitychange"');
    expect(c).toContain("VIGENCIA_VERIFICACION_MS");
  });

  it("las visitas a varias pantallas se guardan en un solo lote", () => {
    const cliente = sinComentarios(hook("useRegistrarVisita"));
    const servidor = sinComentarios(
      readFileSync(resolve(__dirname, "../../functions/src/registrarVisita.ts"), "utf-8"),
    );
    expect(cliente).toContain("pendientesPorUsuario");
    expect(cliente).toContain("pantallas: lote");
    expect(servidor).toContain("request.data?.pantallas");
    expect(servidor).toContain("db.doc(`portalUsers/${uid}`).update(cambios)");
  });
});

describe("caché local: la segunda visita no vuelve a pagar los mismos datos", () => {
  const config = readFileSync(resolve(__dirname, "../config/firebase.ts"), "utf-8");
  const configSinComentarios = sinComentarios(config);

  it("Firestore guarda los documentos en el dispositivo", () => {
    // Sin esto, cada apertura de la app vuelve a descargar y pagar los
    // mismos documentos aunque no haya cambiado nada. El uso real de
    // esta app es la misma persona entrando varias veces al día desde
    // el mismo teléfono: es justo el caso que la caché resuelve.
    expect(configSinComentarios).toContain("persistentLocalCache(");
  });

  it("funciona con varias pestañas abiertas", () => {
    // Con el gestor por defecto, la segunda pestaña se queda SIN caché.
    // Pasa más de lo que parece: basta con abrir un reporte aparte.
    expect(configSinComentarios).toContain("persistentMultipleTabManager()");
  });

  it("se conserva la detección automática de long polling (Safari)", () => {
    // Iba en la misma llamada: si al añadir la caché se hubiera perdido,
    // las pantallas en vivo dejarían de actualizarse en Safari.
    expect(configSinComentarios).toContain("experimentalAutoDetectLongPolling: true");
  });

  it("cerrar sesión corta el listener global y borra URLs privadas", () => {
    const paneles = sinComentarios(hook("usePanelesDisponibles"));
    const urls = sinComentarios(hook("useSignedUrls"));
    expect(configSinComentarios).toContain("limpiadoresDeSesion");
    expect(paneles).toContain("registrarLimpiezaDeSesion(detenerPanelesAlCerrarSesion)");
    expect(paneles).toContain("unsubEscucha?.()");
    expect(urls).toContain("generacionDeSesion += 1");
    expect(configSinComentarios).toContain('localStorage.removeItem("v360_signed_urls_v1")');
  });
});

describe("el respaldo del inventario cubre el FALLO, no solo la ausencia", () => {
  const c = sinComentarios(hook("usePanelesDisponibles"));

  it("cae a la colección si el documento agregado no existe", () => {
    expect(c).toMatch(/if \(!docSnap\.exists\(\)\)[\s\S]{0,80}escucharColeccionDirecta\(\)/);
  });

  it("cae a la colección también si la lectura del agregado FALLA", () => {
    // Este era el hueco que rompió Cobertura en producción: un rechazo
    // por permisos no llega como "documento inexistente", llega al
    // manejador de error. Sin respaldo ahí, el mapa se quedaba vacío
    // con "No tienes permiso para hacer esto".
    const desdeElAgregado = c.slice(c.indexOf('doc(db!, "agregados", "paneles")'));
    const bloqueDeLaEscucha = desdeElAgregado.slice(0, desdeElAgregado.indexOf("function reiniciarEscucha"));
    // DOS veces: una para "no existe" y otra para "falló". Con una sola
    // faltaría justo el caso que rompió producción, y contar es lo único
    // que distingue los dos escenarios de forma fiable.
    const veces = (bloqueDeLaEscucha.match(/escucharColeccionDirecta\(\)/g) ?? []).length;
    expect(veces).toBeGreaterThanOrEqual(2);
  });

  it("avisa en consola cuando usa el respaldo (para poder diagnosticarlo)", () => {
    expect(c).toContain("console.warn");
  });
});
