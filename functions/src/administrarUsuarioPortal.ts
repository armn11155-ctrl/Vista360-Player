import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { esGerente, esTrabajador } from "./rolesInternos.js";
import { crearSolicitudPendiente } from "./solicitudesAccion.js";

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

/** Archivar y restaurar (que básicamente prenden/apagan el acceso de
 *  alguien) quedan exclusivas del Gerente -- no se pidió que un
 *  Trabajador pueda tocar eso. Solo "eliminar" (borrado definitivo)
 *  acepta también al Trabajador, y en ese caso queda pendiente de
 *  aprobación en vez de ejecutarse directo. */
async function requireGerenteOTrabajadorParaEliminar(uid?: string): Promise<{ db: Firestore; rol: unknown; nombre: string }> {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  const rol = propio.data()?.role;
  if (!propio.exists || !(esGerente(rol) || esTrabajador(rol))) {
    throw new HttpsError("permission-denied", "Solo el equipo interno puede administrar usuarios.");
  }
  return { db, rol, nombre: String(propio.data()?.nombre ?? "Un trabajador") };
}

async function requireGerente(uid?: string): Promise<Firestore> {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  if (!propio.exists || !esGerente(propio.data()?.role)) {
    throw new HttpsError("permission-denied", "Solo el Gerente puede administrar usuarios.");
  }
  return db;
}

async function resolverUid(db: Firestore, data: AdministrarUsuarioPortalData): Promise<string | null> {
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
  const accion = request.data.accion;
  if (!accion || !["archivar", "restaurar", "eliminar"].includes(accion)) {
    throw new HttpsError("invalid-argument", "Acción inválida.");
  }

  if (accion !== "eliminar") {
    const db = await requireGerente(request.auth?.uid);
    const invitacionId = limpiar(request.data.invitacionId);
    const email = limpiar(request.data.email).toLowerCase();
    const uid = await resolverUid(db, request.data);
    if (!uid && !invitacionId && !email) {
      throw new HttpsError("invalid-argument", "Falta el usuario a administrar.");
    }
    await ejecutarAdministrarUsuarioPortal(db, { invitacionId, uid, accion });
    return { ok: true, pendiente: false };
  }

  const { db, rol, nombre } = await requireGerenteOTrabajadorParaEliminar(request.auth?.uid);
  const invitacionId = limpiar(request.data.invitacionId);
  const email = limpiar(request.data.email).toLowerCase();
  const uid = await resolverUid(db, request.data);
  if (!uid && !invitacionId && !email) {
    throw new HttpsError("invalid-argument", "Falta el usuario a administrar.");
  }

  if (esTrabajador(rol)) {
    // Se guarda el email como texto suelto en el resumen (no como
    // identificador para ejecutar, ya que uid/invitacionId ya cubren
    // eso) para que el Gerente vea a quién corresponde sin tener que
    // ir a buscarlo.
    let etiqueta = email || invitacionId || uid || "usuario";
    if (uid && !email) {
      const perfil = await db.doc(`portalUsers/${uid}`).get();
      etiqueta = String(perfil.data()?.email ?? perfil.data()?.nombre ?? uid);
    }
    const solicitudId = await crearSolicitudPendiente({
      db,
      tipo: "eliminarUsuario",
      solicitanteUid: request.auth!.uid,
      solicitanteNombre: nombre,
      resumen: `Eliminar definitivamente el acceso de "${etiqueta}".`,
      payload: { invitacionId, uid, email },
    });
    return { ok: true, pendiente: true, solicitudId };
  }

  await ejecutarAdministrarUsuarioPortal(db, { invitacionId, uid, accion: "eliminar" });
  return { ok: true, pendiente: false };
});

export async function ejecutarAdministrarUsuarioPortal(
  db: Firestore,
  { invitacionId, uid, accion }: { invitacionId: string; uid: string | null; accion: AccionUsuarioPortal }
): Promise<void> {
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
}
