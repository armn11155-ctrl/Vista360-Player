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
 * alrededor): header negro con el logo de Vista360 en blanco, una
 * línea de acento azul con efecto de brillo, cuerpo en blanco con el
 * mensaje, y pie negro con teléfono/correo (mismos datos que ya lleva
 * el pie del PDF de Cotización, ver cotizacionPdf.ts) arriba y el
 * eslogan "MÁS QUE VISIBILIDAD. PRESENCIA." debajo. Se manda como
 * `html` ADEMÁS de `text` (nunca en reemplazo) -- `text` sigue siendo
 * el respaldo para los pocos clientes de correo que no rendericen
 * HTML.
 *
 * Todo en tablas HTML con estilos inline a propósito, nada de
 * flexbox/grid -- Outlook de escritorio renderiza el correo con el
 * motor de Word, que ignora casi todo el CSS moderno; tablas +
 * estilos inline es lo único que se ve igual en Gmail, Outlook, Apple
 * Mail y Yahoo a la vez. La línea de acento usa
 * "background-image: linear-gradient(...)" con background-color
 * plano como respaldo -- en los clientes que no soportan gradiente
 * (Apple Mail en iOS, por ejemplo) simplemente se ve azul sólido, sin
 * roturas. Se probó primero armando el degradado a mano con varias
 * celdas de tabla de colores sólidos pegadas una junto a otra, pero
 * varios clientes reales no respetan bien el ancho en porcentaje de
 * celdas vacías (quedan celdas angostas con su ancho mínimo en vez de
 * repartirse el 100%) y además se ven bordes oscuros entre celda y
 * celda -- por eso se volvió a un solo bloque con degradado CSS +
 * respaldo, que no tiene ninguna costura posible porque es un solo
 * elemento.
 *
 * La línea va DENTRO de la misma celda del header (no en una fila de
 * tabla aparte) -- en una fila separada quedaba una línea blanca de
 * unos px entre el negro del header y el azul de la línea, por el
 * espaciado por defecto entre filas de algunos clientes de correo.
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
  const fuente = "Georgia,'Times New Roman',serif";
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
  <body style="margin:0;padding:0;background:#FFFFFF;">
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background:#FFFFFF;font-family:${fuente};border-collapse:collapse;">
      <tr>
        <td style="background-color:#050A12;padding:0;font-size:0;line-height:0;">
          <div style="padding:20px 24px 14px;">
            <img src="${LOGO_BLANCO_URL}" width="150" alt="VISTA360" style="display:block;width:150px;max-width:150px;border:0;outline:none;" />
          </div>
          <div style="height:3px;line-height:3px;font-size:0;background-color:#2F6FED;background-image:linear-gradient(90deg,#2F6FED 0%,#7FB0FF 50%,#2F6FED 100%);">&nbsp;</div>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 24px 22px;color:#172235;font-size:13px;line-height:1.6;font-family:${fuente};">
          ${cuerpoHtml}
        </td>
      </tr>
      <tr>
        <td align="center" style="background-color:#050A12;padding:5px 24px;text-align:center;font-family:${fuente};">
          <div style="text-align:center;line-height:1.15;font-weight:bold;font-size:11px;color:#FFFFFF;"><span x-apple-data-detectors="false" style="color:#FFFFFF !important;">947 957 971 &middot; gestion@vista360player.pe</span></div>
          <div style="text-align:center;line-height:1.15;font-size:8px;letter-spacing:.04em;color:#8B95A5;margin-top:2px;">PUBLICIDAD EXTERIOR &middot; PANELES PREMIUM</div>
          <div style="text-align:center;line-height:1.15;border-top:1px solid rgba(255,255,255,.14);margin-top:3px;padding-top:2px;font-weight:bold;font-size:8.5px;letter-spacing:.03em;color:#FFFFFF;">MAS QUE VISIBILIDAD. PRESENCIA.</div>
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
