import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { exigirCuentaActiva } from "./cuentaPortal.js";
import { exigirRitmo } from "./limitador.js";
import { idOpcional } from "./identificadores.js";
import { auditar } from "./registro.js";

if (getApps().length === 0) {
  initializeApp();
}

/**
 * "Creo que alguien tiene una sesión de mi cuenta. Quiero echarlas todas."
 *
 * Esto NO archiva la cuenta, NO la elimina y NO cambia ningún permiso.
 * Solo expulsa sesiones. Es la respuesta correcta a "perdí el teléfono"
 * o "dejé la sesión abierta en una computadora ajena", y a propósito es
 * una acción sin consecuencias graves: si te equivocaste, vuelves a
 * iniciar sesión y ya está. Por eso puede ejecutarla cualquier rol sobre
 * su propia cuenta, sin pedir contraseña de nuevo -- poner fricción en
 * el botón de emergencia solo conseguiría que no se use cuando hace
 * falta.
 *
 * SOLO sobre la cuenta propia. No existe "cerrar las sesiones de otro":
 * eso sería una forma de molestar a un compañero sin dejar rastro claro,
 * y para cortarle el acceso de verdad a alguien ya está archivar (que sí
 * es de Gerente, sí queda auditado y sí revoca sus tokens).
 */
export const cerrarMisSesiones = onCall(async (request) => {
  const cuenta = await exigirCuentaActiva(request);

  // Límite de ritmo bajo: esto se usa una vez cada muchos meses, en un
  // momento de susto. Un número alto no aportaría nada y dejaría abierta
  // la puerta a usarlo como forma de generar escrituras en bucle.
  exigirRitmo(cuenta.uid, "cerrarMisSesiones", 5);

  // El frontend no necesita mandar uid (se usa siempre el del token),
  // pero si alguien lo manda desde DevTools apuntando a otra persona,
  // se rechaza explícitamente en vez de ignorarlo en silencio: así el
  // intento queda claro y el test puede comprobarlo.
  const objetivo = idOpcional(request.data?.uid, "uid");
  if (objetivo && objetivo !== cuenta.uid) {
    throw new HttpsError(
      "permission-denied",
      "Solo puedes cerrar las sesiones de tu propia cuenta."
    );
  }

  // Dos cosas, y hacen falta LAS DOS:
  //
  //  1. revokeRefreshTokens corta la renovación: ninguna sesión podrá
  //     conseguir un ID token nuevo cuando expire el que tiene.
  //
  //  2. sessionsRevokedAt corta el token que YA tienen en la mano. Sin
  //     esto, un ID token ya emitido seguiría siendo aceptado por las
  //     Cloud Functions hasta una hora (onCall no comprueba revocación),
  //     y "expulsar al intruso" sería en realidad "expulsarlo dentro de
  //     un rato". exigirCuentaActiva() compara este sello contra el
  //     auth_time del token en cada llamada.
  //
  // El orden importa: primero se marca el corte en Firestore (que es lo
  // que bloquea de inmediato), después se revoca en Auth. Si lo segundo
  // fallara, la cuenta ya quedó protegida igual.
  const ahora = Math.floor(Date.now() / 1000);
  await getFirestore().doc(`portalUsers/${cuenta.uid}`).set(
    { sessionsRevokedAt: ahora, sessionsRevokedUpdatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  await getAuth().revokeRefreshTokens(cuenta.uid);

  auditar("sesiones_revocadas", { uid: cuenta.uid });

  // Incluye la sesión desde la que se pidió: es lo que el usuario espera
  // ("todas" es todas) y evita el caso raro de creer que echaste al
  // intruso mientras él sigue dentro y tú no.
  return { ok: true, incluyeSesionActual: true };
});
