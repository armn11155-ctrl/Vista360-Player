import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore, type Query } from "firebase-admin/firestore";
import { esGerente, esTrabajador } from "./rolesInternos.js";
import { crearSolicitudPendiente } from "./solicitudesAccion.js";
import { auditar } from "./registro.js";
import { regenerarAgregadoClientes } from "./agregadoClientes.js";

if (getApps().length === 0) {
  initializeApp();
}

interface AdministrarClienteData {
  clienteId?: string;
  accion?: "archivar" | "restaurar" | "eliminarDefinitivo";
}

/**
 * Archivar / restaurar / eliminar definitivamente un perfil de cliente
 * — antes se hacía con escrituras directas a Firestore desde el
 * selector de clientes (AdminClientPicker), lo que dependía de las
 * reglas de seguridad de Firestore (que viven fuera de este repo, en
 * la consola de Firebase) y fallaban con "permisos insuficientes" para
 * el admin en algunas colecciones. Pasarlo por acá (Admin SDK, sin
 * reglas) lo hace robusto sin tener que tocar esa configuración
 * externa — mismo patrón que el resto de acciones sensibles de admin
 * en este archivo de funciones.
 *
 * Un Trabajador puede archivar/restaurar clientes libremente (parte
 * del trabajo del día a día), pero eliminarDefinitivo -- que borra el
 * cliente y TODO lo asociado, sin vuelta atrás -- queda sujeto a
 * aprobación del Gerente, igual que eliminar una campaña o un usuario.
 */
export const administrarClienteAdmin = onCall<AdministrarClienteData>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const propioSnap = await db.doc(`portalUsers/${uid}`).get();
  const rol = propioSnap.data()?.role;
  if (!propioSnap.exists || !(esGerente(rol) || esTrabajador(rol))) {
    throw new HttpsError("permission-denied", "Solo el equipo interno puede administrar clientes.");
  }

  const clienteId = String(request.data?.clienteId ?? "").trim();
  const accion = request.data?.accion;
  if (!clienteId) {
    throw new HttpsError("invalid-argument", "Falta clienteId.");
  }
  if (accion !== "archivar" && accion !== "restaurar" && accion !== "eliminarDefinitivo") {
    throw new HttpsError("invalid-argument", "Acción inválida.");
  }

  const clienteRef = db.doc(`clientes/${clienteId}`);
  const clienteSnap = await clienteRef.get();
  if (!clienteSnap.exists) {
    throw new HttpsError("not-found", "No se encontró ese cliente.");
  }

  if (accion === "archivar") {
    await clienteRef.set({ archived: true, archivedAt: FieldValue.serverTimestamp() }, { merge: true });
    auditar("cliente_archivado", { uid, objetivoId: clienteId });
    // Mantiene al dia el agregado del selector (lista de clientes y su
    // conteo de campanas activas). No lanza: si falla, el selector cae
    // a leer la coleccion directamente.
    await regenerarAgregadoClientes(db);
    return { ok: true, pendiente: false };
  }

  if (accion === "restaurar") {
    await clienteRef.set({ archived: false, archivedAt: null }, { merge: true });
    // Mantiene al dia el agregado del selector (lista de clientes y su
    // conteo de campanas activas). No lanza: si falla, el selector cae
    // a leer la coleccion directamente.
    await regenerarAgregadoClientes(db);
    return { ok: true, pendiente: false };
  }

  // accion === "eliminarDefinitivo"
  if (esTrabajador(rol)) {
    const nombreCliente = String(clienteSnap.data()?.empresa ?? clienteId);
    const solicitudId = await crearSolicitudPendiente({
      db,
      tipo: "eliminarClienteDefinitivo",
      solicitanteUid: uid,
      solicitanteNombre: String(propioSnap.data()?.nombre ?? "Un trabajador"),
      resumen: `Eliminar definitivamente al cliente "${nombreCliente}" (y todo lo asociado: campañas, informes, accesos, facturas).`,
      payload: { clienteId },
    });
    return { ok: true, pendiente: true, solicitudId };
  }

  await ejecutarEliminarClienteDefinitivo(db, clienteId);
  // Lo más destructivo que puede hacer la app: borra el cliente y TODO
  // lo asociado (campañas, informes, accesos, facturas), sin vuelta
  // atrás. Si algún día alguien pregunta "¿qué pasó con este cliente?",
  // esta línea es la única respuesta posible.
  auditar("cliente_eliminado_definitivo", { uid, objetivoId: clienteId });
  // Mantiene al dia el agregado del selector (lista de clientes y su
  // conteo de campanas activas). No lanza: si falla, el selector cae
  // a leer la coleccion directamente.
  await regenerarAgregadoClientes(db);
  return { ok: true, pendiente: false };
});

export async function ejecutarEliminarClienteDefinitivo(db: Firestore, clienteId: string): Promise<void> {
  const clienteRef = db.doc(`clientes/${clienteId}`);
  const clienteSnap = await clienteRef.get();
  if (!clienteSnap.exists) {
    throw new HttpsError("not-found", "No se encontró ese cliente.");
  }

  // eliminarDefinitivo: borra todo lo asociado a este cliente en las
  // colecciones que dependen de él, y al final el propio documento.
  const clienteData = clienteSnap.data() ?? {};
  const clienteDoc =
    clienteData.ruc ||
    clienteData.documento ||
    clienteData.documentoIdentidad ||
    clienteData.numDoc ||
    clienteData.numeroDocumento ||
    clienteData.cliente_doc ||
    "";

  async function borrarQuery(q: Query) {
    const snap = await q.get();
    let batch = db.batch();
    let count = 0;
    for (const docSnap of snap.docs) {
      batch.delete(docSnap.ref);
      count += 1;
      if (count === 450) {
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    }
    if (count > 0) await batch.commit();
  }

  await borrarQuery(db.collection("contratos").where("cliente_id", "==", clienteId));
  await borrarQuery(db.collection("informesCliente").where("cliente_id", "==", clienteId));
  await borrarQuery(db.collection("solicitudesCampana").where("cliente_id", "==", clienteId));
  await borrarQuery(db.collection("portalUsers").where("clienteId", "==", clienteId));
  await borrarQuery(db.collection("invitacionesPortal").where("clienteId", "==", clienteId));
  // FACTURAS: por identificador Y por RUC.
  //
  // Antes solo se borraban por RUC (cliente_doc), y ahí quedó un agujero
  // real: si el RUC guardado en la ficha del cliente no coincidía
  // EXACTAMENTE con el de sus facturas -- un dígito mal, un espacio, o
  // porque alguien corrigió el RUC de la ficha después de haber subido
  // los PDF -- las facturas sobrevivían al borrado del cliente.
  //
  // Quedaban invisibles para todo el mundo (su RUC ya no correspondía a
  // ningún cliente) pero seguían ocupando espacio y, peor, conservando
  // documentos de un cliente que se pidió eliminar. Se detectaron 4 así
  // en producción, con RUC evidentemente mal escrito ("239u1u3u921").
  //
  // cliente_id es el vínculo fiable: lo escribe la propia aplicación al
  // subir el PDF, no depende de que nadie teclee bien un número. Se
  // mantiene también el borrado por RUC para alcanzar facturas antiguas
  // que quizá no tengan cliente_id.
  await borrarQuery(db.collection("facturas").where("cliente_id", "==", clienteId));
  if (clienteDoc) {
    await borrarQuery(db.collection("facturas").where("cliente_doc", "==", clienteDoc));
  }
  await clienteRef.delete();
}
