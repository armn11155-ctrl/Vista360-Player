import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { exigirCuentaActiva } from "./cuentaPortal.js";
import { exigirRitmo } from "./limitador.js";
import { auditar } from "./registro.js";

if (getApps().length === 0) {
  initializeApp();
}

/**
 * Deja constancia en la auditoría de que una cuenta activó o desactivó
 * su segundo factor.
 *
 * Por qué hace falta una Function para esto: el enrolamiento de TOTP
 * ocurre entre el navegador y Firebase Authentication directamente (así
 * debe ser: el secreto nunca pasa por nosotros). Eso significa que
 * nuestro backend no se entera solo. Sin esta llamada, "¿desde cuándo
 * este Gerente tiene MFA?" y sobre todo "¿quién le quitó el MFA a esta
 * cuenta y cuándo?" no tendrían respuesta.
 *
 * LO QUE NO SE REGISTRA, NUNCA: el secreto TOTP, el código de
 * verificación, la contraseña ni ningún token. Solo el uid, el hecho y
 * el momento. El secreto ni siquiera llega hasta acá -- vive en el
 * navegador y en Firebase, y este endpoint no acepta ningún dato que
 * pudiera contenerlo.
 *
 * Este registro es informativo, no una autorización: el estado real del
 * segundo factor lo guarda Firebase Auth. Que alguien llame esto a mano
 * desde DevTools solo ensucia el log con un evento suyo; no activa ni
 * desactiva nada.
 */
export const registrarEventoMfa = onCall(async (request) => {
  const cuenta = await exigirCuentaActiva(request);
  exigirRitmo(cuenta.uid, "registrarEventoMfa", 10);

  const evento = request.data?.evento;
  if (evento !== "enrolado" && evento !== "desactivado") {
    throw new HttpsError("invalid-argument", "Evento de MFA inválido.");
  }

  auditar(evento === "enrolado" ? "mfa_enrolado" : "mfa_desactivado", { uid: cuenta.uid });
  return { ok: true };
});
