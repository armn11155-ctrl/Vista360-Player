import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

/**
 * Acciones que un Trabajador puede DISPARAR pero no ejecutar directo
 * -- quedan pendientes hasta que el Gerente las apruebe o rechace
 * desde la pantalla de Aprobaciones. Cada tipo guarda en `payload`
 * justo lo que su respectiva función necesita para ejecutarse cuando
 * se aprueba (ver resolverSolicitudAccion.ts).
 */
export type TipoSolicitudAccion =
  | "eliminarContrato"
  | "eliminarClienteDefinitivo"
  | "eliminarUsuario"
  | "crearPanel"
  | "actualizarPanel";

interface CrearSolicitudArgs {
  db: Firestore;
  tipo: TipoSolicitudAccion;
  solicitanteUid: string;
  solicitanteNombre: string;
  /** Texto corto para que el Gerente entienda de un vistazo qué se
   *  está pidiendo, sin tener que interpretar el payload crudo. */
  resumen: string;
  payload: Record<string, unknown>;
}

export async function crearSolicitudPendiente({
  db,
  tipo,
  solicitanteUid,
  solicitanteNombre,
  resumen,
  payload,
}: CrearSolicitudArgs): Promise<string> {
  const ref = await db.collection("solicitudesAccion").add({
    tipo,
    solicitanteUid,
    solicitanteNombre,
    estado: "Pendiente",
    resumen,
    payload,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}
