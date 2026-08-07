import { FieldPath, FieldValue, type Firestore } from "firebase-admin/firestore";

export interface MetadataInformeAgregado {
  contratoNombre?: string;
  vistoPorCliente?: boolean;
  vistoEn?: unknown;
  contrato_id?: string;
  panelesIncluidos?: string[];
}

export function rutaResumenInformes(clienteId: string, anio: string): string {
  return `agregados/informes-${clienteId}-${anio}`;
}

export function idKeyDesdeInformeId(clienteId: string, informeId: string): string {
  return informeId.slice(`${clienteId}_`.length);
}

export function anioDesdeIdKey(idKey: string): string {
  return idKey.slice(0, 4);
}

/**
 * Mantiene la entrada compacta del informe cuando se genera o actualiza.
 * No marca el año como completo: ese indicador solo se escribe después de
 * migrar también todos los reportes históricos de ese año.
 */
export async function guardarMetadataInforme(
  db: Firestore,
  clienteId: string,
  idKey: string,
  metadata: MetadataInformeAgregado
): Promise<void> {
  const anio = anioDesdeIdKey(idKey);
  if (!/^\d{4}$/.test(anio)) return;
  await db.doc(rutaResumenInformes(clienteId, anio)).set(
    {
      informes: { [idKey]: metadata },
      actualizadoEn: new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function eliminarMetadataInforme(
  db: Firestore,
  clienteId: string,
  idKey: string
): Promise<void> {
  const anio = anioDesdeIdKey(idKey);
  if (!/^\d{4}$/.test(anio)) return;
  await db
    .doc(rutaResumenInformes(clienteId, anio))
    .update(new FieldPath("informes", idKey), FieldValue.delete(), "actualizadoEn", new Date().toISOString())
    .catch(() => undefined);
}
