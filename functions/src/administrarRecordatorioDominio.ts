import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { esPersonalInterno } from "./rolesInternos.js";

if (getApps().length === 0) {
  initializeApp();
}

interface AdministrarRecordatorioDominioData {
  accion?: "leer" | "configurar" | "aceptar";
  nombre?: string;
  vence?: string; // "YYYY-MM-DD"
  diasAntes?: number;
}

interface RecordatorioDominioEstado {
  nombre: string;
  vence: string;
  diasAntes: number;
  aceptadoParaVence: string;
}

const DOC_REF = "configuracion/dominio";
const DEFAULT_ESTADO: RecordatorioDominioEstado = { nombre: "", vence: "", diasAntes: 4, aceptadoParaVence: "" };

/**
 * Recordatorio de renovación del dominio propio (vista360player.pe),
 * para que no se venza por descuido -- si eso pasa, se cae el correo
 * (Zoho/Resend) y el sitio hasta que se recupere.
 *
 * Se guarda por Admin SDK (bypasea las reglas de Firestore, que viven
 * fuera de este repo, en la consola de Firebase -- mismo motivo que
 * administrarClienteAdmin.ts: evita depender de una regla nueva para
 * una colección que no existía antes) en vez de escribir directo
 * desde el cliente.
 *
 * "aceptadoParaVence" guarda el valor de "vence" que ya se reconoció
 * -- así, cuando se renueve el dominio de verdad y se actualice
 * "vence" al año siguiente (con accion:"configurar"), el aviso vuelve
 * a aparecer solo, sin que quede "aceptado para siempre" por error.
 */
export const administrarRecordatorioDominio = onCall<AdministrarRecordatorioDominioData>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const propioSnap = await db.doc(`portalUsers/${uid}`).get();
  const rol = propioSnap.data()?.role;
  if (!propioSnap.exists || !esPersonalInterno(rol)) {
    throw new HttpsError("permission-denied", "Solo el equipo interno puede administrar esto.");
  }

  const accion = request.data?.accion ?? "leer";
  const ref = db.doc(DOC_REF);

  if (accion === "configurar") {
    const nombre = String(request.data?.nombre ?? "").trim();
    const vence = String(request.data?.vence ?? "").trim();
    const diasAntes = Number(request.data?.diasAntes ?? 4);
    if (!nombre) throw new HttpsError("invalid-argument", "Falta el nombre del dominio.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vence)) throw new HttpsError("invalid-argument", "La fecha de vencimiento no es válida.");
    // Cambiar "vence" reinicia el reconocimiento -- un vencimiento
    // nuevo (tras renovar) siempre empieza sin aceptar.
    const actualSnap = await ref.get();
    const venceAnterior = actualSnap.exists ? String(actualSnap.data()?.vence ?? "") : "";
    const aceptadoParaVence = venceAnterior === vence ? String(actualSnap.data()?.aceptadoParaVence ?? "") : "";
    await ref.set({ nombre, vence, diasAntes: Number.isFinite(diasAntes) ? diasAntes : 4, aceptadoParaVence }, { merge: true });
  } else if (accion === "aceptar") {
    const actualSnap = await ref.get();
    const vence = actualSnap.exists ? String(actualSnap.data()?.vence ?? "") : "";
    if (!vence) throw new HttpsError("failed-precondition", "No hay un vencimiento configurado todavía.");
    await ref.set({ aceptadoParaVence: vence }, { merge: true });
  } else if (accion !== "leer") {
    throw new HttpsError("invalid-argument", "Acción no reconocida.");
  }

  const finalSnap = await ref.get();
  const data = finalSnap.exists ? finalSnap.data() : {};
  const estado: RecordatorioDominioEstado = {
    nombre: String(data?.nombre ?? DEFAULT_ESTADO.nombre),
    vence: String(data?.vence ?? DEFAULT_ESTADO.vence),
    diasAntes: Number(data?.diasAntes ?? DEFAULT_ESTADO.diasAntes),
    aceptadoParaVence: String(data?.aceptadoParaVence ?? DEFAULT_ESTADO.aceptadoParaVence),
  };
  return estado;
});
