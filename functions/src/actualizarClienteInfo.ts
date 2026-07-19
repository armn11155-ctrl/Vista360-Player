import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) {
  initializeApp();
}

interface ActualizarClienteInfoData {
  clienteId?: string;
  empresa?: string;
  ruc?: string;
  sector?: string;
  ciudad?: string;
  contacto?: string;
  celular?: string;
  avatarKey?: string;
  avatarUrl?: string;
}

const AVATAR_KEYS = new Set(["tower", "store", "factory", "mall", "office", "media", "custom"]);

function limpiar(value?: string) {
  return value?.trim() ?? "";
}

/**
 * Edita los datos de un cliente ya existente (empresa, RUC, sector,
 * ciudad, contacto, celular, avatar) -- antes desde Usuarios solo se
 * podia crear un cliente nuevo o archivar/restaurar/eliminar uno ya
 * creado, pero no corregir su informacion despues. Mismo patron de
 * permisos que crearClienteNuevo.ts / actualizarPanel.ts: pasa por
 * Admin SDK, no depende de las reglas de Firestore.
 *
 * Ademas de clientes/{clienteId}, sincroniza los datos duplicados
 * (nombre/avatar) que ya viven en portalUsers y en invitacionesPortal
 * -- son los que de verdad pinta la lista de Usuarios -- para que el
 * cambio se vea reflejado ahi mismo sin tener que recargar nada mas.
 */
export const actualizarClienteInfo = onCall<ActualizarClienteInfoData>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  if (!propio.exists || propio.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Solo la cuenta admin puede editar clientes.");
  }

  const clienteId = limpiar(request.data.clienteId);
  if (!clienteId) {
    throw new HttpsError("invalid-argument", "Falta el cliente a editar.");
  }

  const clienteRef = db.doc(`clientes/${clienteId}`);
  const clienteSnap = await clienteRef.get();
  if (!clienteSnap.exists) {
    throw new HttpsError("not-found", "No se encontró ese cliente.");
  }

  const empresa = limpiar(request.data.empresa);
  const ruc = limpiar(request.data.ruc);
  const sector = limpiar(request.data.sector);
  const ciudad = limpiar(request.data.ciudad);
  const contacto = limpiar(request.data.contacto);
  const celular = limpiar(request.data.celular);
  const avatarKeyRaw = limpiar(request.data.avatarKey);
  const avatarUrl = limpiar(request.data.avatarUrl);
  const avatarKey = AVATAR_KEYS.has(avatarKeyRaw) ? avatarKeyRaw : undefined;

  if (!empresa) {
    throw new HttpsError("invalid-argument", "El nombre de la empresa es obligatorio.");
  }

  if (ruc) {
    const existente = await db.collection("clientes").where("ruc", "==", ruc).limit(1).get();
    const otro = existente.docs.find((d) => d.id !== clienteId);
    if (otro) {
      throw new HttpsError("already-exists", "Ya existe otro cliente con ese RUC.");
    }
  }

  await clienteRef.set(
    {
      empresa,
      ruc: ruc || FieldValue.delete(),
      sector: sector || FieldValue.delete(),
      ciudad: ciudad || FieldValue.delete(),
      contacto,
      celular,
      ...(avatarKey ? { avatarKey } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const batch = db.batch();

  const portalUsersSnap = await db.collection("portalUsers").where("clienteId", "==", clienteId).get();
  portalUsersSnap.docs.forEach((docSnap) => {
    batch.set(
      docSnap.ref,
      {
        nombre: contacto || empresa,
        ...(avatarKey ? { avatarKey } : {}),
        ...(avatarUrl ? { avatarUrl } : {}),
      },
      { merge: true }
    );
  });

  const invitacionesSnap = await db.collection("invitacionesPortal").where("clienteId", "==", clienteId).get();
  invitacionesSnap.docs.forEach((docSnap) => {
    batch.set(
      docSnap.ref,
      {
        clienteNombre: empresa,
        ...(avatarKey ? { avatarKey } : {}),
        ...(avatarUrl ? { avatarUrl } : {}),
      },
      { merge: true }
    );
  });

  await batch.commit();

  return { ok: true };
});
