import { useEffect, useState } from "react";
import { collection, doc, getCountFromServer, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../config/firebase";
import { clientesAdminEnMemoria } from "./useClientesAdmin";

export interface VisitaPantalla {
  count: number;
  lastVisit: number | null;
}

export interface AccesoCliente {
  clienteId: string;
  empresa: string;
  lastLogin: number | null;
  lastLoginCount: number;
  pantallasVisitadas: Record<string, VisitaPantalla>;
}

export type AccesosState =
  | { status: "loading" }
  | { status: "ready"; accesos: AccesoCliente[]; total: number; hayMas: boolean }
  | { status: "error"; message: string };

// Analitica no es tiempo real: hasta ahora hacia las mismas dos consultas
// completas cada vez que se salia y volvia a entrar. Guardar el ultimo
// resultado durante un minuto elimina rebotes y dobles montajes sin ocultar
// cambios por mucho tiempo. La promesa compartida evita tambien que dos
// montajes simultaneos dupliquen exactamente la misma consulta.
/**
 * Caché de la analítica de accesos: 10 minutos.
 *
 * ESTA PANTALLA ES O(n) RESPECTO AL NÚMERO DE CLIENTES, a propósito y con
 * el coste medido.
 *
 * `cargarAccesos` pide `portalUsers` filtrando por role == "cliente", SIN
 * limit: una lectura por cuenta de cliente, cada vez que la caché vence.
 * No es un descuido, es una decisión tomada con los números delante:
 *
 *      100 clientes ->      100 lecturas por apertura
 *    1.000 clientes ->    1.000 lecturas
 *   10.000 clientes ->   10.000 lecturas  (la cuota diaria gratuita
 *                                          entera, desde UNA pantalla)
 *
 * Se eligió no acotarla porque la analítica pierde sentido si esconde
 * clientes: la pregunta que se le hace a esta pantalla suele ser "¿quién
 * NO ha entrado?", y esos son justo los que se caerían de un `orderBy`
 * por última entrada (Firestore descarta los documentos sin ese campo).
 *
 * La caché pasó de 1 a 10 minutos: la pantalla la abre una sola persona
 * (solo el Gerente puede leer portalUsers) y unos minutos de retraso en
 * una analítica no le importan a nadie. Eso divide por diez las
 * aperturas que llegan a Firestore, pero NO cambia el fondo: el coste de
 * cada carga sigue creciendo con cada cliente nuevo.
 *
 * DISPARADOR PARA CAMBIARLO: al pasar de ~2.000 clientes. Ahí la opción
 * correcta es un resumen mantenido por el backend (mismo patrón que
 * `agregados/clientes-N`), que deja el coste en 1 lectura fija.
 */
const VIGENCIA_CACHE_MS = 10 * 60_000;

/**
 * Cuántas fichas se leen por página.
 *
 * ANTES ESTA PANTALLA ERA O(n) RESPECTO AL NÚMERO DE CLIENTES: pedía
 * `portalUsers` filtrando por role == "cliente" SIN limit, o sea una
 * lectura por cuenta cada vez que la caché vencía.
 *
 *      100 clientes ->      100 lecturas por apertura
 *    1.000 clientes ->    1.000 lecturas
 *   10.000 clientes ->   10.000 lecturas  (la cuota diaria gratuita
 *                                          entera, desde UNA pantalla)
 *
 * Ahora se piden los 300 con actividad más reciente y se pide aparte el
 * TOTAL con `getCountFromServer`, que Firestore cobra a 1 lectura por
 * cada 1.000 documentos contados en lugar de 1 por documento. El coste
 * queda fijo:
 *
 *   10.000 clientes -> 300 lecturas + 10 del contador = 310, siempre.
 *
 * "Cargar 300 más" pide la página siguiente con un cursor, así que
 * ningún cliente queda inalcanzable: solo deja de bajarse de golpe lo
 * que nadie estaba mirando.
 */
const POR_PAGINA = 300;
let cacheAccesos: { accesos: AccesoCliente[]; actualizadoEn: number; total: number } | null = null;
let cargaEnCurso: Promise<{ accesos: AccesoCliente[]; total: number }> | null = null;

interface ClienteAgregado {
  id: string;
  empresa?: string;
}

async function empresasDesdeAgregado(): Promise<Map<string, string>> {
  const enMemoria = clientesAdminEnMemoria();
  if (enMemoria) {
    return new Map(enMemoria.map((cliente) => [cliente.id, cliente.empresa ?? cliente.id]));
  }
  if (!db) return new Map();

  // Respaldo barato para una entrada directa excepcional: se leen las
  // mismas partes agregadas del selector, nunca la coleccion completa.
  const primera = await getDoc(doc(db, "agregados/clientes-0"));
  const datos = primera.data() as { clientes?: ClienteAgregado[]; partes?: number } | undefined;
  if (!primera.exists() || !Array.isArray(datos?.clientes)) return new Map();

  const partes = Math.max(1, Number(datos.partes ?? 1) || 1);
  const filas = [...datos.clientes];
  if (partes > 1) {
    const resto = await Promise.all(
      Array.from({ length: partes - 1 }, (_, indice) =>
        getDoc(doc(db!, `agregados/clientes-${indice + 1}`))
      )
    );
    resto.forEach((parte) => {
      const contenido = parte.data() as { clientes?: ClienteAgregado[] } | undefined;
      if (Array.isArray(contenido?.clientes)) filas.push(...contenido.clientes);
    });
  }
  return new Map(filas.map((cliente) => [cliente.id, cliente.empresa ?? cliente.id]));
}

async function cargarAccesos(): Promise<{ accesos: AccesoCliente[]; total: number }> {
  if (!db) return { accesos: [], total: 0 };
  if (cargaEnCurso) return cargaEnCurso;

  cargaEnCurso = (async () => {
    // La lista/nombres de clientes ya fue leida por el selector en la
    // misma sesion. Analitica solo necesita pedir los portalUsers cliente.
    const [portalSnap, empresas, conteo] = await Promise.all([
      getDocs(
        query(
          collection(db!, "portalUsers"),
          where("role", "==", "cliente"),
          // Los de actividad más reciente primero, y solo una página.
          //
          // OJO CON UN DETALLE DE FIRESTORE: un orderBy DESCARTA los
          // documentos que no tengan ese campo. Una cuenta que nunca
          // inició sesión no tiene `lastLogin`, así que no aparecería.
          // Por eso crearClienteAcceso escribe `lastLogin: null` al crear
          // la cuenta: un null SÍ se indexa, y en orden descendente cae al
          // final -- se ve al pulsar "Cargar más", que es donde tiene
          // sentido buscar a quien nunca entró.
          orderBy("lastLogin", "desc"),
          limit(POR_PAGINA)
        )
      ),
      empresasDesdeAgregado(),
      // El total EXACTO sin leer una ficha por cliente: Firestore cobra
      // el conteo a 1 lectura por cada 1.000 documentos contados. Con
      // 10.000 clientes son 10 lecturas en vez de 10.000.
      getCountFromServer(query(collection(db!, "portalUsers"), where("role", "==", "cliente"))),
    ]);
    const total = conteo.data().count;

    const accesos: AccesoCliente[] = [];
    portalSnap.forEach((d) => {
      const data = d.data();
      const clienteId: string = data.clienteId ?? "";
      if (!clienteId) return;

      const pantallasRaw = data.pantallasVisitadas ?? {};
      const pantallasVisitadas: Record<string, VisitaPantalla> = {};
      for (const [pantalla, v] of Object.entries(pantallasRaw as Record<string, any>)) {
        pantallasVisitadas[pantalla] = {
          count: v.count ?? 0,
          lastVisit: v.lastVisit?.toMillis?.() ?? null,
        };
      }

      accesos.push({
        clienteId,
        empresa: empresas.get(clienteId) ?? clienteId,
        lastLogin: data.lastLogin?.toMillis?.() ?? null,
        lastLoginCount: data.lastLoginCount ?? 0,
        pantallasVisitadas,
      });
    });

    accesos.sort((a, b) => (b.lastLogin ?? 0) - (a.lastLogin ?? 0));
    cacheAccesos = { accesos, actualizadoEn: Date.now(), total };
    return { accesos, total };
  })().finally(() => {
    cargaEnCurso = null;
  });

  return cargaEnCurso;
}

/**
 * Lee los accesos de los usuarios cliente directo desde Firestore,
 * sin Cloud Functions. Solo lo usa la cuenta admin. Los nombres de
 * empresa se reutilizan del agregado que el selector ya cargo.
 */
export function useAccesosClientes(isAdmin: boolean): AccesosState {
  const cacheVigente = cacheAccesos && Date.now() - cacheAccesos.actualizadoEn < VIGENCIA_CACHE_MS;
  const [state, setState] = useState<AccesosState>(
    cacheVigente
      ? {
          status: "ready",
          accesos: cacheAccesos!.accesos,
          total: cacheAccesos!.total,
          hayMas: cacheAccesos!.accesos.length < cacheAccesos!.total,
        }
      : { status: "loading" }
  );

  useEffect(() => {
    // Salir sin fijar estado dejaba el hook en "loading" PARA SIEMPRE:
    // la pantalla se quedaba con el spinner girando en vez de mostrar
    // algo. Cuando no hay nada que consultar, el resultado correcto es
    // "listo y vacío", no "cargando".
    if (!isAdmin || !db) { setState({ status: "ready", accesos: [], total: 0, hayMas: false }); return; }
    let cancelled = false;

    async function cargar() {
      try {
        const vigente = cacheAccesos && Date.now() - cacheAccesos.actualizadoEn < VIGENCIA_CACHE_MS;
        const datos = vigente
          ? { accesos: cacheAccesos!.accesos, total: cacheAccesos!.total }
          : await cargarAccesos();
        if (!cancelled) {
          setState({
            status: "ready",
            accesos: datos.accesos,
            total: datos.total,
            hayMas: datos.accesos.length < datos.total,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "No se pudo cargar la analítica.",
          });
        }
      }
    }

    cargar();
    return () => { cancelled = true; };
  }, [isAdmin]);

  return state;
}
