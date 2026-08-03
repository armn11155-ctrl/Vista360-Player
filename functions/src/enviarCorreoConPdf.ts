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
 * marca -- se pidio calcar la elegancia de la portada del PDF de
 * reporte (ver portada() en generarReporteCliente.ts): fondo azul
 * marino oscuro de punta a punta (mismo #0A0F1C que COLORS.bg alla)
 * con los mismos dos brillos suaves de esquina que la portada (arriba
 * a la derecha y abajo a la izquierda, via radial-gradient con
 * background-color plano de respaldo), logo alineado a la izquierda
 * arriba con una rayita azul corta justo debajo (eco del subrayado de
 * "REPORTE MENSUAL" en la portada, pero pegada al logo en vez de
 * centrada), una tarjeta BLANCA flotante con el mensaje (eco de la
 * tarjeta CLIENTE/PERIODO de la portada) y el contacto/eslogan abajo,
 * directo sobre el fondo oscuro (mismos datos que ya lleva el pie del
 * PDF de Cotización, ver cotizacionPdf.ts). Se manda como `html`
 * ADEMÁS de `text` (nunca en reemplazo) -- `text` sigue siendo el
 * respaldo para los pocos clientes de correo que no rendericen HTML.
 *
 * Todo en tablas HTML con estilos inline a propósito, nada de
 * flexbox/grid -- Outlook de escritorio renderiza el correo con el
 * motor de Word, que ignora casi todo el CSS moderno; tablas +
 * estilos inline es lo único que se ve igual en Gmail, Outlook, Apple
 * Mail y Yahoo a la vez. El fondo oscuro se pone tanto en el <body>
 * como en bgcolor="#0A0F1C" de la tabla (algunos clientes viejos
 * ignoran el background por CSS del <body> y se quedan en blanco).
 *
 * La rayita de acento es un solo bloque con degradado CSS + color
 * solido de respaldo -- se probo antes armando degradados a mano con
 * celdas de tabla pegadas una junto a otra y varios clientes reales
 * no repartian bien el ancho en porcentaje entre celdas vacias
 * (quedaban celdas angostas, con bordes oscuros entre celda y celda).
 * Un solo elemento no tiene ninguna costura posible.
 *
 * El pie va en una sola columna (contacto arriba, eslogan abajo) en
 * vez de dos columnas lado a lado -- en pantallas angostas (celular)
 * dos columnas con este texto no entran sin amontonarse.
 *
 * El bloque <style> en el head SOLO desactiva el auto-detector de
 * Apple Mail (convierte teléfonos/correos en links azules subrayados
 * que pisan el color blanco del diseño) -- no se usa para layout.
 */
function construirHtmlCorreo(mensaje: string): string {
  const cuerpoHtml = escapeHtml(mensaje).split("\n").join("<br>");
  const fuente = "Arial,Helvetica,sans-serif";
  const bg = "#0A0F1C";
  const accent = "#2F6FED";
  const accent2 = "#5B93FF";
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="format-detection" content="telephone=no,date=no,address=no,email=no" />
    <style type="text/css">
      a[x-apple-data-detectors] {
        color: inherit !important;
        text-decoration: none !important;
        font-size: inherit !important;
        font-family: inherit !important;
        font-weight: inherit !important;
        line-height: inherit !important;
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:${bg};">
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${bg}" style="background-color:${bg};background-image:radial-gradient(circle at 92% -10%, #17335C 0%, #0E1830 45%, transparent 70%), radial-gradient(circle at 8% 110%, #17335C 0%, #0E1830 45%, transparent 70%);font-family:${fuente};border-collapse:collapse;">
      <tr>
        <td align="left" style="padding:48px 24px 0 32px;">
          <img src="${LOGO_BLANCO_URL}" width="220" alt="VISTA360" style="display:block;width:220px;max-width:220px;border:0;outline:none;" />
        </td>
      </tr>
      <tr>
        <td align="left" style="padding:14px 24px 34px 32px;">
          <table role="presentation" align="left" cellpadding="0" cellspacing="0" style="width:96px;">
            <tr><td height="3" style="height:3px;line-height:3px;font-size:0;background-color:${accent};background-image:linear-gradient(90deg,${accent} 0%,${accent2} 50%,${accent} 100%);">&nbsp;</td></tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding:0 24px 40px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#FFFFFF;border-radius:16px;">
            <tr>
              <td style="padding:32px 30px;color:#172235;font-size:14px;line-height:1.65;font-family:${fuente};">
                ${cuerpoHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding:0 24px 46px;font-family:${fuente};">
          <div style="text-align:center;line-height:1.3;font-weight:bold;font-size:13px;color:#FFFFFF;"><span x-apple-data-detectors="false" style="color:#FFFFFF !important;">947 957 971 &middot; gestion@vista360player.pe</span></div>
          <div style="text-align:center;line-height:1.3;font-size:9.5px;letter-spacing:.04em;color:#8B96AD;margin-top:5px;">PUBLICIDAD EXTERIOR &middot; PANELES PREMIUM</div>
          <div style="text-align:center;line-height:1.3;border-top:1px solid rgba(255,255,255,.14);margin-top:14px;padding-top:12px;font-weight:bold;font-size:10.5px;letter-spacing:.03em;color:#FFFFFF;">MAS QUE VISIBILIDAD. PRESENCIA.</div>
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
