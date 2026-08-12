import { onCall, HttpsError } from "firebase-functions/v2/https";
import { exigirRitmo } from "./limitador.js";
import {
  exigirGerente,
  exigirPersonalInterno,
  exigirAutenticacionReciente,
  exigirQueNoSeaUnoMismo,
} from "./cuentaPortal.js";
import { getAuth } from "firebase-admin/auth";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { esGerente, esTrabajador } from "./rolesInternos.js";
import { crearSolicitudPendiente } from "./solicitudesAccion.js";
import { idOpcional } from "./identificadores.js";
import { auditar } from "./registro.js";

if (getApps().length === 0) {
  initializeApp();
}


/**
 * ¿La cuenta que se va a tocar es de un Gerente?
 *
 * Se usa para decidir si la operación es CRÍTICA (hay que volver a pedir
 * la contraseña) o solo SENSIBLE. Cortar una cuenta Gerente es el
 * movimiento más destructivo que existe acá dentro -- es exactamente lo
 * que haría un atacante para quedarse solo en la casa -- así que esa sí
 * pide reautenticación. Archivar un cliente o un trabajador no la pide:
 * es una operación de todos los días y llenar de contraseñas el trabajo
 * normal solo consigue que la gente se acostumbre a escribirla sin
 * mirar, que es justo lo que no queremos.
 */
async function objetivoEsGerente(db: Firestore, uid: string | null): Promise<boolean> {
  if (!uid) return false;
  const snap = await db.doc(`portalUsers/${uid}`).get();
  return esGerente(snap.data()?.role);
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

async function resolverUid(data: AdministrarUsuarioPortalData): Promise<string | null> {
  // El uid que llega del cliente se valida; el que devuelve getUserByEmail
  // lo genera Firebase Auth y no puede contener barras.
  const uid = idOpcional(data.uid, "uid");
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
    const gerente = await exigirGerente(request, "Solo el Gerente puede administrar usuarios.");
    exigirRitmo(gerente.uid, "administrarUsuarioPortal", 30);
    const db = getFirestore();
    const invitacionId = idOpcional(request.data?.invitacionId, "invitacionId");
    const email = limpiar(request.data.email).toLowerCase();
    const uid = await resolverUid(request.data);
    if (!uid && !invitacionId && !email) {
      throw new HttpsError("invalid-argument", "Falta el usuario a administrar.");
    }

    // Nadie se archiva a sí mismo, ni siquiera queriendo. Ver
    // exigirQueNoSeaUnoMismo() para el porqué.
    if (accion === "archivar") {
      exigirQueNoSeaUnoMismo(gerente.uid, uid);
    }

    // Archivar a OTRO Gerente sí se puede (hay que poder cortar una
    // cuenta Gerente comprometida), pero exige contraseña reciente.
    if (accion === "archivar" && (await objetivoEsGerente(db, uid))) {
      exigirAutenticacionReciente(
        request,
        "Vuelve a escribir tu contraseña para archivar a otro Gerente."
      );
    }

    await ejecutarAdministrarUsuarioPortal(db, { invitacionId, uid, accion, ejecutadoPor: gerente.uid });
    return { ok: true, pendiente: false };
  }

  const cuenta = await exigirPersonalInterno(request, "Solo el equipo interno puede administrar usuarios.");
  exigirRitmo(cuenta.uid, "administrarUsuarioPortal", 30);
  const db = getFirestore();
  const rol = cuenta.role;
  const nombre = cuenta.nombre || "Un trabajador";
  const invitacionId = idOpcional(request.data?.invitacionId, "invitacionId");
  const email = limpiar(request.data.email).toLowerCase();
  const uid = await resolverUid(request.data);
  if (!uid && !invitacionId && !email) {
    throw new HttpsError("invalid-argument", "Falta el usuario a administrar.");
  }

  // Vale igual para eliminar: ni un Gerente ni un Trabajador pueden
  // borrarse a sí mismos (el Trabajador ni siquiera podría "pedirlo"
  // para sí mismo y dejar la solicitud lista para que la aprueben).
  exigirQueNoSeaUnoMismo(
    cuenta.uid,
    uid,
    "No puedes eliminar tu propia cuenta. Pídeselo a otro Gerente."
  );

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
      solicitanteUid: cuenta.uid,
      solicitanteNombre: nombre,
      resumen: `Eliminar definitivamente el acceso de "${etiqueta}".`,
      payload: { invitacionId, uid, email },
    });
    return { ok: true, pendiente: true, solicitudId };
  }

  // Eliminar definitivamente a otro Gerente: igual que archivarlo, pero
  // sin vuelta atrás. Contraseña reciente obligatoria.
  if (await objetivoEsGerente(db, uid)) {
    exigirAutenticacionReciente(
      request,
      "Vuelve a escribir tu contraseña para eliminar a otro Gerente."
    );
  }

  await ejecutarAdministrarUsuarioPortal(db, { invitacionId, uid, accion: "eliminar", ejecutadoPor: cuenta.uid });
  return { ok: true, pendiente: false };
});

export async function ejecutarAdministrarUsuarioPortal(
  db: Firestore,
  { invitacionId, uid, accion, ejecutadoPor }:
    { invitacionId: string; uid: string | null; accion: AccionUsuarioPortal; ejecutadoPor?: string }
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
      // disabled:true por sí solo NO corta una sesión ya iniciada: solo
      // bloquea inicios de sesión y renovaciones de token NUEVAS. Un
      // token ya emitido seguiría siendo válido para Cloud Functions
      // hasta su expiración natural (hasta 1 hora) si no se revoca el
      // refresh token acá mismo. Esto es lo que permite decir de verdad
      // "corté el acceso ahora" en un incidente (cuenta comprometida,
      // baja de personal) en vez de "corté el acceso en la próxima hora".
      // El lado de Firestore Rules queda cerrado de inmediato aparte,
      // vía esCuentaDePortal() comprobando `archived` en cada lectura.
      await getAuth().updateUser(uid, { disabled: true }).catch(() => undefined);
      await getAuth().revokeRefreshTokens(uid).catch(() => undefined);
    } else if (accion === "restaurar") {
      await getAuth().updateUser(uid, { disabled: false }).catch(() => undefined);
    } else {
      // Misma razón que en "archivar": revocar antes de borrar corta
      // cualquier token que ya estuviera circulando, no solo el acceso
      // futuro que deleteUser bloquea.
      await getAuth().revokeRefreshTokens(uid).catch(() => undefined);
      await getAuth().deleteUser(uid).catch(() => undefined);
    }
  }

  // Queda el rastro de QUIEN eliminó el acceso de quién y cuándo -- se
  // registra tanto si lo ejecuta el Gerente directo como si viene de
  // una solicitud de un Trabajador ya aprobada (resolverSolicitudAccion.ts
  // llama a esta misma función), porque en ambos casos el efecto es el
  // mismo borrado definitivo.
  if (accion === "eliminar") {
    auditar("usuario_eliminado", { uid: ejecutadoPor, objetivoId: uid ?? invitacionId ?? undefined });
  } else if (accion === "archivar") {
    auditar("usuario_archivado", { uid: ejecutadoPor, objetivoId: uid ?? invitacionId ?? undefined });
  }
}
