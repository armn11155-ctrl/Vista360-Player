/** Fotos ya recortadas para el PDF. El borrador vive solo en este navegador. */
export interface FotoBorradorReporte {
  id: string;
  nombre: string;
  dataUrl: string;
}

export interface BorradorReporte {
  dia: string;
  fotosPorPanel: Record<string, FotoBorradorReporte[]>;
  guardadoEn: number;
}

const DB_NAME = "vista360-borradores-reportes";
const STORE = "borradores";
const MAX_EDAD_MS = 30 * 24 * 60 * 60 * 1000;
const operaciones = new Map<string, Promise<unknown>>();

export function claveBorradorReporte(uid: string, clienteId: string, contratoId: string, mes: string): string {
  return [uid, clienteId, contratoId, mes].join(":");
}

function abrirDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("Este navegador no permite guardar borradores.")); return; }
    const solicitud = indexedDB.open(DB_NAME, 1);
    solicitud.onupgradeneeded = () => {
      if (!solicitud.result.objectStoreNames.contains(STORE)) solicitud.result.createObjectStore(STORE);
    };
    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => reject(solicitud.error ?? new Error("No se pudo abrir el almacenamiento local."));
  });
}

async function transaccion<T>(modo: IDBTransactionMode, ejecutar: (store: IDBObjectStore, resolver: (valor: T) => void) => void): Promise<T> {
  const db = await abrirDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, modo);
    let resultado: T;
    tx.oncomplete = () => { db.close(); resolve(resultado); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error("No se pudo guardar el borrador.")); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Se interrumpió el guardado del borrador.")); };
    ejecutar(tx.objectStore(STORE), (valor) => { resultado = valor; });
  });
}

function encolar<T>(clave: string, accion: () => Promise<T>): Promise<T> {
  const anterior = operaciones.get(clave) ?? Promise.resolve();
  const actual = anterior.catch(() => undefined).then(accion);
  operaciones.set(clave, actual);
  void actual.finally(() => { if (operaciones.get(clave) === actual) operaciones.delete(clave); }).catch(() => undefined);
  return actual;
}

export async function leerBorradorReporte(clave: string): Promise<BorradorReporte | null> {
  await operaciones.get(clave)?.catch(() => undefined);
  const borrador = await transaccion<BorradorReporte | null>("readonly", (store, resolver) => {
    const solicitud = store.get(clave);
    solicitud.onsuccess = () => resolver((solicitud.result as BorradorReporte | undefined) ?? null);
  });
  if (!borrador) return null;
  if (!Number.isFinite(borrador.guardadoEn) || Date.now() - borrador.guardadoEn > MAX_EDAD_MS) {
    await borrarBorradorReporte(clave);
    return null;
  }
  return borrador;
}

export function guardarBorradorReporte(clave: string, borrador: BorradorReporte): Promise<void> {
  return encolar(clave, () => transaccion<void>("readwrite", (store) => { store.put(borrador, clave); }));
}

export function borrarBorradorReporte(clave: string): Promise<void> {
  return encolar(clave, () => transaccion<void>("readwrite", (store) => { store.delete(clave); }));
}
