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

/** Imagenes del "brillo" azul de esquina (mismo tratamiento que la
 *  portada del PDF, ver portada() en generarReporteCliente.ts) --
 *  ACA son imagenes PNG de verdad (radial ya "horneado" en los
 *  pixeles), no un CSS radial-gradient: el primer intento fue un
 *  radial-gradient() en el background-image de la tabla, pero varios
 *  clientes reales (Apple Mail entre ellos, se confirmo probando en
 *  un correo real) recortan silenciosamente cualquier gradiente en
 *  background-image y solo dejan el color plano de respaldo -- ahi
 *  el fondo se veia todo oscuro parejo, sin ninguna luz. Una imagen
 *  normal (background-image: url(...)) si la respetan.
 *
 *  Son DOS imagenes (no una reusada) porque el punto mas brillante
 *  esta pegado a una esquina exacta de la imagen -- asi, sin importar
 *  cuanto mida la celda de header/pie en cada cliente de correo,
 *  "background-position: top right" / "bottom left" siempre deja ese
 *  punto brillante justo en la esquina visible. El primer intento
 *  tenia el brillo centrado en el medio de una imagen cuadrada
 *  (como el radial-gradient original) y quedaba invisible en el pie
 *  de pagina, mas bajito que el header: la parte visible de esa
 *  celda no llegaba a alcanzar la zona brillante del centro. */
const GLOW_URL_TR = "https://vista360player.pe/vista360-correo-glow.png";
const GLOW_URL_BL = "https://vista360player.pe/vista360-correo-glow-bl.png";
// PNGs de color solido (8x8, se repiten en mosaico sin que se note --
// es un color plano) para las secciones que dependian SOLO de
// background-color CSS. Se agregan como respaldo via el atributo
// "background" clasico de <td>/<table>, que Outlook (motor Word/VML)
// respeta directo -- las imagenes no las invierte el modo oscuro de
// Outlook (que hace inversion bit a bit de cada color CSS declarado),
// asi que esto es la forma real de que esas dos secciones NO cambien
// de color ahi, en vez de depender de que Outlook respete el meta
// color-scheme (que en la practica es inconsistente segun version).
const FONDO_BLANCO_URL = "https://vista360player.pe/vista360-correo-fondo-blanco.png";
const FONDO_NAVY_URL = "https://vista360player.pe/vista360-correo-fondo-navy.png";

/**
 * Envuelve el mensaje de texto plano en el diseño de correo de la
 * marca -- se pidio calcar la elegancia de la portada del PDF de
 * reporte (ver portada() en generarReporteCliente.ts): fondo azul
 * marino oscuro de punta a punta (mismo #0A0F1C que COLORS.bg alla)
 * con los mismos dos brillos suaves de esquina que la portada (arriba
 * a la derecha en el header, abajo a la izquierda en el pie -- via
 * GLOW_URL, una imagen PNG real, ver comentario ahi de por que no es
 * un radial-gradient CSS), logo alineado a la izquierda
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
    <!-- El diseño YA es oscuro a propósito -- sin esto, el modo oscuro
         del cliente de correo (Apple Mail, Outlook.com, Gmail, etc.)
         "adivina" qué es fondo y qué es texto y reinvierte colores por
         su cuenta -- eso era lo que volvía negra la tarjeta blanca del
         mensaje (texto oscuro sobre fondo oscuro, ilegible). "light
         dark" (no solo "light") declara soporte para AMBOS y deja que
         las reglas @media (prefers-color-scheme: dark) de abajo manden
         -- con "light" a secas, algunas versiones de Apple Mail igual
         invierten por su cuenta el blanco/negro PURO (#FFFFFF/#000000)
         con una heurística vieja que no depende de este meta en
         absoluto (por eso además se cambió el blanco puro del diseño a
         #FEFEFE en todo el correo -- ver comentario de Litmus/Email on
         Acid sobre esto: es un bug histórico de Apple Mail, no algo
         que un meta tag por sí solo alcance a arreglar). -->
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <style type="text/css">
      a[x-apple-data-detectors] {
        color: inherit !important;
        text-decoration: none !important;
        font-size: inherit !important;
        font-family: inherit !important;
        font-weight: inherit !important;
        line-height: inherit !important;
      }
      /* Los metas de arriba (color-scheme/supported-color-schemes) NO
         los respetan todos los clientes -- Gmail en particular corre su
         propio algoritmo de modo oscuro casi siempre, meta o no. Esta
         es la segunda capa: mismos colores, pero reforzados con
         !important bajo dark mode, en vez de confiar en que el cliente
         se abstenga solo. [data-ogsc]/[data-ogsb] son los atributos que
         Gmail agrega él mismo a los elementos que decidió "oscurecer" --
         es el gancho oficial para revertirlo (ver documentación pública
         de Litmus/Email on Acid sobre esto, no es un invento). */
      @media (prefers-color-scheme: dark) {
        .vp-bg-navy { background-color: #0A0F1C !important; }
        .vp-card { background-color: #FEFEFE !important; }
        .vp-card-text { color: #172235 !important; }
        .vp-white-text { color: #FEFEFE !important; }
        .vp-muted-text { color: #8B96AD !important; }
      }
      [data-ogsc] .vp-bg-navy, [data-ogsb] .vp-bg-navy { background-color: #0A0F1C !important; }
      [data-ogsc] .vp-card, [data-ogsb] .vp-card { background-color: #FEFEFE !important; }
      [data-ogsc] .vp-card-text, [data-ogsb] .vp-card-text { color: #172235 !important; }
      [data-ogsc] .vp-white-text, [data-ogsb] .vp-white-text { color: #FEFEFE !important; }
      [data-ogsc] .vp-muted-text, [data-ogsb] .vp-muted-text { color: #8B96AD !important; }
    </style>
  </head>
  <body bgcolor="${bg}" style="margin:0;padding:0;background-color:${bg};">
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${bg}" background="${FONDO_NAVY_URL}" class="vp-bg-navy" style="background-color:${bg};font-family:${fuente};border-collapse:collapse;">
      <tr>
        <td align="left" bgcolor="${bg}" background="${GLOW_URL_TR}" class="vp-bg-navy" style="background-color:${bg};background-image:url(${GLOW_URL_TR});background-repeat:no-repeat;background-position:top right;background-size:280px 280px;padding:48px 24px 34px 32px;">
          <img src="${LOGO_BLANCO_URL}" width="220" alt="VISTA360" style="display:block;width:220px;max-width:220px;border:0;outline:none;" />
          <table role="presentation" align="left" cellpadding="0" cellspacing="0" style="width:96px;margin-top:14px;">
            <tr><td height="3" style="height:3px;line-height:3px;font-size:0;background-color:${accent};background-image:linear-gradient(90deg,${accent} 0%,${accent2} 50%,${accent} 100%);">&nbsp;</td></tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" bgcolor="${bg}" background="${FONDO_NAVY_URL}" class="vp-bg-navy" style="background-color:${bg};padding:0 24px 40px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FEFEFE" background="${FONDO_BLANCO_URL}" class="vp-card" style="max-width:480px;background-color:#FEFEFE;border-radius:16px;">
            <tr>
              <td bgcolor="#FEFEFE" background="${FONDO_BLANCO_URL}" class="vp-card vp-card-text" style="background-color:#FEFEFE;padding:32px 30px;color:#172235;mso-style-textfill-fill-color:#172235;font-size:14px;line-height:1.65;font-family:${fuente};">
                ${cuerpoHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" bgcolor="${bg}" background="${GLOW_URL_BL}" class="vp-bg-navy" style="background-color:${bg};background-image:url(${GLOW_URL_BL});background-repeat:no-repeat;background-position:bottom left;background-size:280px 280px;padding:0 24px 46px;font-family:${fuente};">
          <div style="text-align:center;line-height:1.3;font-weight:bold;font-size:13px;color:#FEFEFE;mso-style-textfill-fill-color:#FEFEFE;" class="vp-white-text"><span x-apple-data-detectors="false" class="vp-white-text" style="color:#FEFEFE !important;mso-style-textfill-fill-color:#FEFEFE;">947 957 971 &middot; gestion@vista360player.pe</span></div>
          <div style="text-align:center;line-height:1.3;font-size:9.5px;letter-spacing:.04em;color:#8B96AD;margin-top:5px;mso-style-textfill-fill-color:#8B96AD;" class="vp-muted-text">PUBLICIDAD EXTERIOR &middot; PANELES PREMIUM</div>
          <div style="text-align:center;line-height:1.3;border-top:1px solid rgba(255,255,255,.14);margin-top:14px;padding-top:12px;font-weight:bold;font-size:10.5px;letter-spacing:.03em;color:#FEFEFE;mso-style-textfill-fill-color:#FEFEFE;" class="vp-white-text">MAS QUE VISIBILIDAD. PRESENCIA.</div>
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
