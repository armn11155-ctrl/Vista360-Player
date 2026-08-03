import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
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

const REMITENTE = "Vista360 <gestion@vista360player.pe>";

/** Escapa texto que va a caer dentro de HTML crudo -- el mensaje trae
 *  nombre del cliente y de la campaña, que vienen de datos cargados
 *  por el admin, no queremos que un "<" o "&" suelto rompa el diseño
 *  ni abra una inyección. Mismo criterio que escapeHtml en
 *  Cobertura.tsx (acá aparte porque este archivo corre en el backend,
 *  sin acceso al DOM). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** URL pública del logo de Vista360 en blanco, para el header negro del
 *  correo -- vive en /public (mismo dominio que sirve el resto de la
 *  app, se despliega solo con el push a main). Tiene que ser una URL
 *  y NO un data:URI: Outlook de escritorio no renderiza imágenes en
 *  base64 incrustadas en el HTML, así que un logo inline se vería
 *  como un ícono roto justo en el cliente donde más importa que las
 *  tablas + estilos inline ya cubren el resto del diseño. */
const LOGO_BLANCO_URL = "https://vista360player.pe/vista360-logo-correo-blanco.png";

/**
 * Envuelve el mensaje de texto plano en el diseño de correo de la
 * marca -- a pantalla completa (sin tarjeta centrada ni fondo gris
 * alrededor, a pedido explícito): header negro con el logo de
 * Vista360 en blanco, una línea con degradado azul (mismo azul de
 * marca que el resto de la app), cuerpo en blanco con el mensaje, y
 * pie negro con teléfono/correo (mismos datos que ya lleva el pie
 * del PDF de Cotización, ver cotizacionPdf.ts) a la izquierda y el
 * eslogan "MÁS QUE VISIBILIDAD. PRESENCIA." a la derecha. Se manda
 * como `html` ADEMÁS de `text` (nunca en reemplazo) -- `text` sigue
 * siendo el respaldo para los pocos clientes de correo que no
 * rendericen HTML.
 *
 * Todo en tablas HTML con estilos inline a propósito, nada de
 * flexbox/grid ni <style> en el <head> -- Outlook de escritorio
 * renderiza el correo con el motor de Word, que ignora casi todo el
 * CSS moderno; tablas + estilos inline (y el degradado con
 * background-color de respaldo) es lo único que se ve igual en
 * Gmail, Outlook, Apple Mail y Yahoo a la vez.
 */
function construirHtmlCorreo(mensaje: string): string {
  const cuerpoHtml = escapeHtml(mensaje).split("\n").join("<br>");
  const fuente = "Georgia,'Times New Roman',serif";
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#FFFFFF;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;font-family:${fuente};">
      <tr>
        <td style="background-color:#050A12;padding:28px 32px 20px;">
          <img src="${LOGO_BLANCO_URL}" width="200" alt="VISTA360" style="display:block;width:200px;max-width:200px;border:0;outline:none;" />
        </td>
      </tr>
      <tr>
        <td height="3" style="height:3px;line-height:3px;font-size:0;background-color:#2F6FED;background-image:linear-gradient(90deg,#2F6FED 0%,#7FB0FF 50%,#2F6FED 100%);">&nbsp;</td>
      </tr>
      <tr>
        <td style="padding:24px 32px 26px;color:#172235;font-size:14px;line-height:1.7;font-family:${fuente};">
          ${cuerpoHtml}
        </td>
      </tr>
      <tr>
        <td style="background-color:#050A12;padding:20px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="left" valign="middle" style="font-family:${fuente};">
                <div style="font-weight:bold;font-size:13px;color:#FFFFFF;">947 957 971 &middot; gestion@vista360player.pe</div>
                <div style="font-size:9.5px;letter-spacing:.06em;color:#8B95A5;margin-top:3px;">PUBLICIDAD EXTERIOR &middot; PANELES PREMIUM</div>
              </td>
              <td align="right" valign="middle" style="font-family:${fuente};font-weight:bold;font-size:10.5px;letter-spacing:.03em;color:#FFFFFF;white-space:nowrap;">
                MAS QUE VISIBILIDAD.<br/>PRESENCIA.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Envia un correo con un PDF adjunto de VERDAD desde el backend -- a
 * diferencia de compartir desde el navegador (Web Share o mailto:),
 * esto no depende de que la persona elija un contacto ni una app: el
 * destinatario, asunto, mensaje y adjunto quedan armados de una sola
 * vez y el correo sale solo con un clic, sin ningun paso manual.
 *
 * Usa la API de Resend (dominio propio vista360player.pe, ya
 * verificado con DKIM -- no aparece "vía resend.com" en Gmail/Outlook
 * porque la firma DKIM coincide con el dominio del remitente). Antes
 * esto iba por SMTP del Hotmail de la empresa, pero se cambió a
 * Resend: las cuentas personales de Outlook/Hotmail tienen un tope
 * bajo (~300 correos/día) y sobre todo estan pensadas para que
 * escriba una persona, no un script -- mandar por ahi de forma
 * automatizada arriesga que Microsoft marque la cuenta como
 * sospechosa. Resend esta hecho justo para esto (3,000 correos/mes
 * gratis, sin ese riesgo). RESEND_API_KEY vive en Secret Manager,
 * igual que el resto de credenciales de este proyecto (ver
 * scripts/set-r2-secrets-direct.mjs).
 */
export const enviarCorreoConPdf = onCall<EnviarCorreoConPdfData>(
  { secrets: ["RESEND_API_KEY"] },
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

    let bufferBytes: number;
    try {
      bufferBytes = Buffer.from(archivoBase64, "base64").byteLength;
    } catch {
      throw new HttpsError("invalid-argument", "El archivo adjunto no es válido.");
    }
    if (bufferBytes === 0 || bufferBytes > MAX_ARCHIVO_BYTES) {
      throw new HttpsError("invalid-argument", "El archivo adjunto tiene un tamaño inválido.");
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new HttpsError("failed-precondition", "El envío de correo no está configurado todavía (falta RESEND_API_KEY).");
    }

    // Se arma en una variable (no inline en el fetch) para poder loguear
    // el tamaño EXACTO de lo que se manda -- sin esto, si Resend acepta
    // el pedido (200) pero el correo llega sin adjunto, no hay forma de
    // saber si el problema es que nunca se mandó bien el archivo desde
    // acá, o si es solo cómo Resend lo muestra en su propio dashboard.
    const cuerpo = {
      from: REMITENTE,
      to: destinatario,
      subject: asunto,
      text: mensaje,
      html: construirHtmlCorreo(mensaje),
      attachments: [{ filename: nombreArchivo, content: archivoBase64 }],
    };
    console.log(
      `enviarCorreoConPdf: mandando a Resend -- destinatario=${destinatario}, archivo=${nombreArchivo}, bytesAdjunto=${bufferBytes}, largoBase64=${archivoBase64.length}, largoBodyJSON=${JSON.stringify(cuerpo).length}`
    );

    try {
      const respuesta = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(cuerpo),
      });
      if (!respuesta.ok) {
        const detalle = await respuesta.text().catch(() => "");
        console.error(`Resend respondió ${respuesta.status} al enviar el correo:`, detalle);
        throw new Error(`Resend respondió ${respuesta.status}`);
      }
    } catch (error) {
      console.error("No se pudo enviar el correo con PDF adjunto:", error);
      throw new HttpsError("internal", "No se pudo enviar el correo. Intenta de nuevo en un momento.");
    }

    // Se le devuelve el tamaño del adjunto a quien llamó -- así se ve
    // en la app misma, sin tener que entrar a los logs de Cloud
    // Functions ni al dashboard de Resend para confirmar que sí se
    // mandó un PDF de verdad y no uno vacío o roto.
    return { ok: true, bytesAdjunto: bufferBytes };
  }
);
