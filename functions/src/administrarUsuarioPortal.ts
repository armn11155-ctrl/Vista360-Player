import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) {
  initializeApp();
}

type AccionUsuarioPortal = "archivar" | "restaurar" | "eliminar";

interface AdministrarUsuarioPortalData {
  invitacionId?: string;
  uid?: string;
  email?: string;
  accion?: AccionUsuarioPortal;
}

function limpiar(value?: string) {
  return value?.trim() ?? "";
}

async function requireAdmin(uid?: string) {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  if (!propio.exists || propio.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Solo la cuenta admin puede administrar usuarios.");
  }
}

async function resolverUid(data: AdministrarUsuarioPortalData): Promise<string | null> {
  const uid = limpiar(data.uid);
  if (uid) return uid;

  const email = limpiar(data.email).toLowerCase();
  if (!email) return null;

  try {
    return (await getAuth().getUserByEmail(email)).uid;
  } catch {
    return null;
  }
}

export const administrarUsuarioPortal = onCall<AdministrarUsuarioPortalData>(async (request) => {
  await requireAdmin(request.auth?.uid);

  const accion = request.data.accion;
  const invitacionId = limpiar(request.data.invitacionId);
  const email = limpiar(request.data.email).toLowerCase();
  const uid = await resolverUid(request.data);

  if (!accion || !["archivar", "restaurar", "eliminar"].includes(accion)) {
    throw new HttpsError("invalid-argument", "Acción inválida.");
  }
  if (!uid && !invitacionId && !email) {
    throw new HttpsError("invalid-argument", "Falta el usuario a administrar.");
  }

  const db = getFirestore();
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();

  if (invitacionId) {
    const invitacionRef = db.doc(`invitacionesPortal/${invitacionId}`);
    if (accion === "eliminar") {
      batch.delete(invitacionRef);
    } else {
      batch.set(invitacionRef, {
        archived: accion === "archivar",
        archivedAt: accion === "archivar" ? now : null,
        restoredAt: accion === "restaurar" ? now : null,
        updatedAt: now,
      }, { merge: true });
    }
  }

  if (uid) {
    const portalUserRef = db.doc(`portalUsers/${uid}`);
    if (accion === "eliminar") {
      batch.delete(portalUserRef);
    } else {
      batch.set(portalUserRef, {
        archived: accion === "archivar",
        archivedAt: accion === "archivar" ? now : null,
        restoredAt: accion === "restaurar" ? now : null,
        updatedAt: now,
      }, { merge: true });
    }
  }

  await batch.commit();

  if (uid) {
    if (accion === "archivar") {
      await getAuth().updateUser(uid, { disabled: true }).catch(() => undefined);
    } else if (accion === "restaurar") {
      await getAuth().updateUser(uid, { disabled: false }).catch(() => undefined);
    } else {
      await getAuth().deleteUser(uid).catch(() => undefined);
    }
  }

  return { ok: true };
});
