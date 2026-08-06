import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
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
  | { status: "ready"; accesos: AccesoCliente[] }
  | { status: "error"; message: string };

// Analitica no es tiempo real: hasta ahora hacia las mismas dos consultas
// completas cada vez que se salia y volvia a entrar. Guardar el ultimo
// resultado durante un minuto elimina rebotes y dobles montajes sin ocultar
// cambios por mucho tiempo. La promesa compartida evita tambien que dos
// montajes simultaneos dupliquen exactamente la misma consulta.
const VIGENCIA_CACHE_MS = 60_000;
let cacheAccesos: { accesos: AccesoCliente[]; actualizadoEn: number } | null = null;
let cargaEnCurso: Promise<AccesoCliente[]> | null = null;

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

async function cargarAccesos(): Promise<AccesoCliente[]> {
  if (!db) return [];
  if (cargaEnCurso) return cargaEnCurso;

  cargaEnCurso = (async () => {
    // La lista/nombres de clientes ya fue leida por el selector en la
    // misma sesion. Analitica solo necesita pedir los portalUsers cliente.
    const [portalSnap, empresas] = await Promise.all([
      getDocs(query(collection(db!, "portalUsers"), where("role", "==", "cliente"))),
      empresasDesdeAgregado(),
    ]);

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
    cacheAccesos = { accesos, actualizadoEn: Date.now() };
    return accesos;
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
    cacheVigente ? { status: "ready", accesos: cacheAccesos!.accesos } : { status: "loading" }
  );

  useEffect(() => {
    // Salir sin fijar estado dejaba el hook en "loading" PARA SIEMPRE:
    // la pantalla se quedaba con el spinner girando en vez de mostrar
    // algo. Cuando no hay nada que consultar, el resultado correcto es
    // "listo y vacío", no "cargando".
    if (!isAdmin || !db) { setState({ status: "ready", accesos: [] }); return; }
    let cancelled = false;

    async function cargar() {
      try {
        const vigente = cacheAccesos && Date.now() - cacheAccesos.actualizadoEn < VIGENCIA_CACHE_MS;
        const accesos = vigente ? cacheAccesos!.accesos : await cargarAccesos();
        if (!cancelled) setState({ status: "ready", accesos });
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
