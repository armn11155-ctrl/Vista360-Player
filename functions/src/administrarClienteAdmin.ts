import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Query } from "firebase-admin/firestore";

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
 */
export const administrarClienteAdmin = onCall<AdministrarClienteData>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const propioSnap = await db.doc(`portalUsers/${uid}`).get();
  if (!propioSnap.exists || propioSnap.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Solo la cuenta admin puede administrar clientes.");
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
    return { ok: true };
  }

  if (accion === "restaurar") {
    await clienteRef.set({ archived: false, archivedAt: null }, { merge: true });
    return { ok: true };
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
  if (clienteDoc) {
    await borrarQuery(db.collection("facturas").where("cliente_doc", "==", clienteDoc));
  }
  await clienteRef.delete();

  return { ok: true };
});
