import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import nodemailer from "nodemailer";
import { esPersonalInterno } from "./rolesInternos.js";

if (getApps().length === 0) {
  initializeApp();
}

interface EnviarCorreoConPdfData {
  destinatario?: string;
  asunto?: string;
  mensaje?: string;
  archivoBase64?: string;
  nombreArchivo?: string;
}

// Un poco de margen sobre el limite tipico de adjuntos de Gmail/Outlook
// (~25MB/20MB) -- los PDF que genera esta app pesan unos cientos de KB,
// asi que en la practica esto solo frena archivos claramente mal armados.
const MAX_ARCHIVO_BYTES = 20 * 1024 * 1024;

/**
 * Envia un correo con un PDF adjunto de VERDAD desde el backend -- a
 * diferencia de compartir desde el navegador (Web Share o mailto:),
 * esto no depende de que la persona elija un contacto ni una app: el
 * destinatario, asunto, mensaje y adjunto quedan armados de una sola
 * vez y el correo sale solo con un clic, sin ningun paso manual.
 *
 * Usa el Hotmail/Outlook de la empresa (ochomillas.101@hotmail.com)
 * por SMTP, con una "contraseña de aplicación" -- Microsoft ya no deja
 * autenticar por SMTP con la contraseña normal de la cuenta si tiene
 * verificación en dos pasos activada, hace falta generar una
 * contraseña de aplicación aparte desde account.microsoft.com.
 * SMTP_USER/SMTP_PASS viven en Secret Manager, igual que el resto de
 * credenciales de este proyecto (ver scripts/set-r2-secrets-direct.mjs).
 */
export const enviarCorreoConPdf = onCall<EnviarCorreoConPdfData>(
  { secrets: ["SMTP_USER", "SMTP_PASS"] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const db = getFirestore();
    const propioSnap = await db.doc(`portalUsers/${uid}`).get();
    const rol = propioSnap.data()?.role;
    if (!propioSnap.exists || !esPersonalInterno(rol)) {
      throw new HttpsError("permission-denied", "Solo el equipo interno puede enviar correos.");
    }

    const destinatario = String(request.data?.destinatario ?? "").trim();
    const asunto = String(request.data?.asunto ?? "").trim();
    const mensaje = String(request.data?.mensaje ?? "");
    const archivoBase64 = String(request.data?.archivoBase64 ?? "");
    const nombreArchivo = String(request.data?.nombreArchivo ?? "documento.pdf").trim() || "documento.pdf";

    if (!destinatario || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario)) {
      throw new HttpsError("invalid-argument", "El correo del destinatario no es válido.");
    }
    if (!asunto) {
      throw new HttpsError("invalid-argument", "Falta el asunto.");
    }
    if (!archivoBase64) {
      throw new HttpsError("invalid-argument", "Falta el archivo adjunto.");
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(archivoBase64, "base64");
    } catch {
      throw new HttpsError("invalid-argument", "El archivo adjunto no es válido.");
    }
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_ARCHIVO_BYTES) {
      throw new HttpsError("invalid-argument", "El archivo adjunto tiene un tamaño inválido.");
    }

    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    if (!smtpUser || !smtpPass) {
      throw new HttpsError("failed-precondition", "El envío de correo no está configurado todavía (faltan credenciales SMTP).");
    }

    const transporter = nodemailer.createTransport({
      host: "smtp-mail.outlook.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: smtpUser, pass: smtpPass },
    });

    try {
      await transporter.sendMail({
        from: `"Vista360" <${smtpUser}>`,
        to: destinatario,
        subject: asunto,
        text: mensaje,
        attachments: [{ filename: nombreArchivo, content: buffer, contentType: "application/pdf" }],
      });
    } catch (error) {
      console.error("No se pudo enviar el correo con PDF adjunto:", error);
      throw new HttpsError("internal", "No se pudo enviar el correo. Intenta de nuevo en un momento.");
    }

    return { ok: true };
  }
);
