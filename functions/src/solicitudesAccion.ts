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

  // Estas solicitudes no pasan por `solicitudesCampana`, por lo que el
  // trigger que avisa sobre campañas nuevas nunca se entera de ellas.
  // Resultado: el Gerente veía el badge al volver a abrir la app, pero no
  // recibía ningún push cuando un Trabajador pedía crear/editar un panel.
  //
  // El import queda dentro del camino secundario y DESPUÉS de la escritura:
  // la persistencia de la aprobación es el trabajo principal; el aviso no
  // puede impedirla. Si FCM está temporalmente caído, la solicitud ya quedó
  // guardada y no debe devolverse un falso error al Trabajador.
  try {
    const { enviarPushAAdmin } = await import("./notificacionesPush.js");
    const titulo = tipo === "crearPanel"
      ? "Nuevo panel pendiente de aprobación"
      : tipo === "actualizarPanel"
        ? "Cambio de panel pendiente"
        : "Nueva aprobación pendiente";
    await enviarPushAAdmin({
      title: titulo,
      body: `${solicitanteNombre}: ${resumen}`,
      url: "/",
    });
  } catch (error) {
    console.error("La solicitud se guardó, pero no se pudo avisar al Gerente.", error);
  }

  return ref.id;
}
