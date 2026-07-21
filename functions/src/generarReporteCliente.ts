import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { R2_SECRETS, firmarLecturaR2, subirBufferR2 } from "./r2Storage.js";

if (getApps().length === 0) {
  initializeApp();
}

type FotoInput = string | { url: string; fecha?: string; titulo?: string };

export interface ReporteElemento {
  titulo: string;
  fotos: FotoInput[];
  ubicacion?: string;
  /** Solo se llena cuando el elemento viene de panelesFotos (reporte
   *  por campaña) -- se usa despues para guardar en el informe cuales
   *  paneles quedaron cubiertos ese dia (ver panelesIncluidos mas
   *  abajo). En el flujo viejo (sin campaña) queda undefined. */
  panelId?: string;
}

interface ClienteReporte {
  id: string;
  nombre: string;
  periodo: string;
  ubicacion: string;
  ciudad: string;
  /** true si el reporte junta 2+ paneles -- en ese caso `ubicacion` en
   *  realidad son los nombres de los paneles unidos (no una dirección
   *  real), asi que la portada debe decir "PANELES" en vez de
   *  "UBICACION" para no confundir. Con 1 panel (o el flujo viejo sin
   *  campaña) sigue diciendo "UBICACION" como siempre. */
  esMultiPanel?: boolean;
}

interface ReportePdf {
  buffer: Buffer;
  numEvidencias: number;
  numElementos: number;
}

/**
 * Diseño horizontal (16:9) — replica el modelo
 * "Reporte_Fotografico_Mensual_VISTA360_Horizontal_Premium.pdf":
 * portada oscura, páginas de evidencia alternando fondo blanco/oscuro
 * (empezando en blanco) una foto grande por página, y cierre con foto
 * de fondo a página completa. Los logos vienen de functions/assets/logos
 * (ya en PNG con transparencia real). El fondo del cierre es opcional:
 * si no existe el archivo todavía, se usa un degradado oscuro de
 * respaldo para no romper el despliegue.
 */
const PAGE = { width: 1600, height: 900, margin: 74 };

const COLORS = {
  bg: "#0a0f1c",
  card: "#0d1729",
  accent: "#2f6fed",
  accent2: "#5b93ff",
  white: "#ffffff",
  ink: "#0a0f1c",
  muted: "#8b96ad",
  mutedOnLight: "#64748b",
  line: "#1c2942",
  lineLight: "#e2e8f0",
  // Azul intermedio -- mas oscuro que el "accent" (fondo grande de
  // paginaPanel) pero mas claro que "bg" (la barra negra del pie). Se
  // usa solo en la linea fina que separa el fondo azul de esa barra.
  accentDark: "#123778",
};

const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
const LOGO_WORDMARK_WHITE = join(ASSETS_DIR, "logos/vista360-wordmark-white.png");
const RING_PORTADA = join(ASSETS_DIR, "decor/ring-portada.png");
const LOGO_PLAYER_WHITE = join(ASSETS_DIR, "logos/vista360-player-white.png");
const LOGO_PLAYER_BLACK = join(ASSETS_DIR, "logos/vista360-player-black.png");
// Misma imagen que LOGO_PLAYER_WHITE pero con "PLAYER" (y las lineas)
// tambien en blanco en vez de azul -- en LOGO_PLAYER_WHITE ese texto es
// azul, que sobre el fondo azul de paginaPanel() practicamente no se
// veia (mismo problema que ya se corrigio con la direccion). Se usa
// SOLO en paginaPanel(); el resto de paginas (fondo oscuro casi negro)
// siguen usando LOGO_PLAYER_WHITE normal, donde el azul si contrasta.
const LOGO_PLAYER_WHITE_MONO = join(ASSETS_DIR, "logos/vista360-player-white-mono.png");

const pad2 = (n: number) => String(n).padStart(2, "0");

/** El diseño de referencia no usa tildes en ningún texto (mayúsculas
 *  incluidas) — replicamos eso exactamente en vez de "corregir" la
 *  ortografía. */
function sinTildes(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeFoto(foto: FotoInput) {
  return typeof foto === "string" ? { url: foto } : foto;
}

function nombreMes(mes: string) {
  const [year, month] = mes.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  const label = new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** Etiqueta corta CON dia ("17 Jul 2026") -- se puede generar mas de un
 *  reporte por mes (uno por dia distinto), asi que el mes solo ("Julio
 *  2026") ya no alcanza para diferenciarlos en la lista. */
function nombreFechaCorta(fecha: string) {
  const [year, month, day] = fecha.split("-").map(Number);
  if (!year || !month || !day) return fecha;
  return `${String(day).padStart(2, "0")} ${MESES_CORTOS[month - 1]} ${year}`;
}

function monthRange(mes: string) {
  const [year, month] = mes.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, month, 0));
  const end = `${year}-${String(month).padStart(2, "0")}-${String(endDate.getUTCDate()).padStart(2, "0")}`;
  return { start, end };
}

function timestampToIso(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString().slice(0, 10);
  if (typeof value === "string") return value.slice(0, 10);
  return "";
}

function fechaCorta(iso?: string) {
  if (!iso) {
    return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
  }
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

async function imageBuffer(url: string) {
  if (url.startsWith("data:image/")) {
    const base64 = url.split(",")[1];
    if (!base64) throw new Error("Imagen inválida.");
    return Buffer.from(base64, "base64");
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`No se pudo descargar imagen: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/** Ghostscript no esta disponible en el runtime de Cloud Functions (por
 *  eso el PDF nunca se comprimia de verdad antes) — la compresion real
 *  se hace aca, reduciendo cada foto antes de insertarla en el PDF.
 *  Un solo nivel de calidad para todo el reporte (ya no se genera una
 *  version "HD" aparte: duplicaba espacio en R2 sin necesidad).
 *
 *  Se probo contra los dos peores casos posibles para JPEG: (1) un
 *  degradado suave de cielo nocturno, donde el banding se nota primero,
 *  y (2) un panel/valla con texto legible (el contenido real que
 *  importa en estos reportes), donde la nitidez del texto se pierde
 *  primero. mozjpeg (trellis quantisation + scans optimizados, tabla
 *  de cuantizacion 3, que salio mejor que las otras 8 en las pruebas)
 *  aguanta sin artefactos visibles y sin perder el texto incluso muy
 *  por debajo de esta calidad — se dejo un margen de seguridad arriba
 *  del piso real para no arriesgar en fotos con mas ruido de camara. */
const FOTO_CONFIG = { maxWidth: 1200, quality: 55 };

async function comprimirFoto(buffer: Buffer) {
  try {
    return await sharp(buffer)
      .rotate()
      .resize({ width: FOTO_CONFIG.maxWidth, withoutEnlargement: true })
      .jpeg({
        quality: FOTO_CONFIG.quality,
        mozjpeg: true,
        chromaSubsampling: "4:2:0",
      })
      .toBuffer();
  } catch (error) {
    console.warn("No se pudo comprimir una foto del reporte; se usa el original.", error);
    return buffer;
  }
}

async function cargarFotoComprimida(url: string) {
  const raw = await imageBuffer(url);
  return comprimirFoto(raw);
}

/** Dibuja una imagen cubriendo un rectángulo (crop centrado), con esquinas redondeadas. */
function drawImageCover(doc: PDFKit.PDFDocument, src: Buffer | string, x: number, y: number, w: number, h: number, radius = 22) {
  const img = (doc as unknown as { openImage: (s: Buffer | string) => { width: number; height: number } }).openImage(src);
  const scale = Math.max(w / img.width, h / img.height);
  const iw = img.width * scale;
  const ih = img.height * scale;
  const ix = x + (w - iw) / 2;
  const iy = y + (h - ih) / 2;
  doc.save();
  doc.roundedRect(x, y, w, h, radius).clip();
  doc.image(src, ix, iy, { width: iw, height: ih });
  doc.restore();
}

/** Anillo decorativo: recortado directo del PDF de referencia del
 *  cliente (no dibujado por codigo), para que sea exactamente el mismo
 *  gráfico, pixel por pixel. */
function drawRingAsset(doc: PDFKit.PDFDocument, x: number, y: number, width: number) {
  doc.image(RING_PORTADA, x, y, { width });
}

function drawKicker(doc: PDFKit.PDFDocument, text: string, x: number, y: number, color = COLORS.accent, size = 14) {
  const upper = sinTildes(text.toUpperCase());
  doc.font("Helvetica-Bold").fontSize(size).fillColor(color).text(upper, x, y, { characterSpacing: 2 });
  const w = doc.widthOfString(upper, { characterSpacing: 2 });
  const lineY = y + size + 8;
  doc.moveTo(x, lineY).lineTo(x + Math.min(w, 96), lineY).lineWidth(2).strokeColor(color).stroke();
}

/** Pie de pagina fino (portada y paginas oscuras): una linea + texto.
 *  La linea es opcional (showLine) — en las paginas de evidencia oscuras
 *  se quita porque queda recargado con el resto del diseño; en la
 *  portada se deja. */
function drawFooterLine(doc: PDFKit.PDFDocument, num: string, dark: boolean, showLine = true) {
  const y = PAGE.height - 44;
  if (showLine) {
    doc.moveTo(PAGE.margin, y).lineTo(PAGE.width - PAGE.margin, y).lineWidth(1)
      .strokeColor(dark ? COLORS.line : COLORS.lineLight).stroke();
  }
  doc.font("Helvetica").fontSize(10.5).fillColor(dark ? COLORS.muted : COLORS.mutedOnLight)
    .text("VISTA360 - REPORTE FOTOGRAFICO", PAGE.margin, y + 12, { characterSpacing: 1 });
  doc.font("Helvetica-Bold").fontSize(11).fillColor(dark ? COLORS.white : COLORS.ink)
    .text(num, PAGE.width - PAGE.margin - 40, y + 12, { width: 40, align: "right" });
}

/** Pie de pagina de barra (paginas blancas de evidencia): barra oscura de
 *  103px con una linea de acento de 5px justo encima, a todo el ancho.
 *  El color de esa linea es configurable (stripColor) -- en la
 *  divisoria de panel (fondo azul) tiene que ser blanca para que se
 *  note contra el azul; en las paginas de evidencia (fondo blanco)
 *  sigue siendo el azul de acento de siempre. La barra oscura de abajo
 *  NO cambia en ningun caso -- se pidio que esa se quede siempre negra. */
function drawFooterBar(doc: PDFKit.PDFDocument, num: string, stripColor = COLORS.accent) {
  const barH = 103;
  const barY = PAGE.height - barH;
  doc.rect(0, barY - 5, PAGE.width, 5).fill(stripColor);
  doc.rect(0, barY, PAGE.width, barH).fill(COLORS.bg);
  doc.font("Helvetica").fontSize(10.5).fillColor(COLORS.muted)
    .text("VISTA360 - REPORTE FOTOGRAFICO", PAGE.margin, barY + (barH - 11) / 2, { characterSpacing: 1 });
  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLORS.white)
    .text(num, PAGE.width - PAGE.margin - 40, barY + (barH - 11) / 2, { width: 40, align: "right" });
}

/** Baja el tamano de fuente (en pasos de 0.5pt) hasta que el texto entre
 *  en una sola linea dentro de maxWidth, sin pasar de minSize. Si ni al
 *  minimo entra en una linea, se queda en minSize y el texto ya se deja
 *  hacer wrap a 2 lineas (el llamador debe medir la altura resultante). */
function tamanoQueEntra(
  doc: PDFKit.PDFDocument,
  texto: string,
  maxWidth: number,
  fontName: string,
  startSize: number,
  minSize: number
) {
  doc.font(fontName);
  let size = startSize;
  while (size > minSize) {
    doc.fontSize(size);
    if (doc.widthOfString(texto) <= maxWidth) return size;
    size -= 0.5;
  }
  doc.fontSize(minSize);
  return minSize;
}

function portada(doc: PDFKit.PDFDocument, cliente: ClienteReporte) {
  doc.rect(0, 0, PAGE.width, PAGE.height).fill(COLORS.bg);
  // El anillo se sale del borde superior-derecho de la pagina (bleed),
  // tal como en la referencia. Es un recorte real del PDF de referencia,
  // no un dibujo por codigo, para que sea exactamente el mismo grafico.
  drawRingAsset(doc, 1001, 0, 599);

  doc.image(LOGO_WORDMARK_WHITE, PAGE.margin, 78, { width: 365 });

  const ciudad = sinTildes(cliente.ciudad || "Peru");
  drawKicker(doc, `Reporte mensual / ${ciudad}`, PAGE.margin, 212, COLORS.accent, 18);

  doc.font("Helvetica-Bold").fontSize(86).fillColor(COLORS.white).text("REPORTE", PAGE.margin, 266, { characterSpacing: 0.5 });
  doc.font("Helvetica-Bold").fontSize(86).fillColor(COLORS.white).text("FOTOGRAFICO", PAGE.margin, 362, { characterSpacing: 0.5 });

  // Tarjetas mas compactas (menos espacio vacio que el primer calco de
  // la referencia — el hueco se notaba mucho con textos cortos reales).
  const cardY = 626;
  const cardH = 108;

  // Tarjeta blanca: Cliente / Periodo
  const cardX1 = 74;
  const cardW1 = 865;
  doc.roundedRect(cardX1, cardY, cardW1, cardH, 18).fill(COLORS.white);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.accent).text("CLIENTE", cardX1 + 42, cardY + 22, { characterSpacing: 1.5 });
  doc.font("Helvetica-Bold").fontSize(22).fillColor(COLORS.ink).text(sinTildes(cliente.nombre), cardX1 + 42, cardY + 46, { width: 380 });
  doc.moveTo(cardX1 + 488, cardY + 22).lineTo(cardX1 + 488, cardY + 86).lineWidth(1).strokeColor(COLORS.lineLight).stroke();
  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.accent).text("PERIODO", cardX1 + 528, cardY + 22, { characterSpacing: 1.5 });
  doc.font("Helvetica-Bold").fontSize(22).fillColor(COLORS.ink).text(sinTildes(cliente.periodo), cardX1 + 528, cardY + 46, { width: 280 });

  // Tarjeta oscura: Ubicacion — mas clara que el fondo (antes se
  // perdia contra el negro) y con una linea de acento arriba, igual
  // que la tarjeta flotante de las paginas de evidencia. La altura y
  // el tamano de letra se ajustan solos cuando la direccion es larga
  // (primero se achica el texto, y si aun asi no entra en una linea,
  // recien ahi el cuadro crece un poco) -- con textos cortos queda
  // exactamente igual que antes.
  const cardX2 = 1012;
  const cardW2 = 418;
  const innerW2 = cardW2 - 60;
  const [lugarRaw, ...restoParts] = sinTildes(cliente.ubicacion).split(" - ");
  const lugar = lugarRaw || sinTildes(cliente.ubicacion);
  const resto = restoParts.join(", ");

  const lugarSize = tamanoQueEntra(doc, lugar, innerW2, "Helvetica-Bold", 18, 13);
  doc.font("Helvetica-Bold").fontSize(lugarSize);
  const lugarHeight = doc.heightOfString(lugar, { width: innerW2 });

  let restoSize = 13;
  let restoHeight = 0;
  if (resto) {
    restoSize = tamanoQueEntra(doc, resto, innerW2, "Helvetica", 13, 9.5);
    doc.font("Helvetica").fontSize(restoSize);
    restoHeight = doc.heightOfString(resto, { width: innerW2 });
  }

  const lugarY = 46;
  const restoY = lugarY + lugarHeight + 10;
  const contenidoAbajo = resto ? restoY + restoHeight : lugarY + lugarHeight;
  // No crece mas alla del pie de pagina (deja un margen de seguridad).
  const maxCardH2 = PAGE.height - 44 - cardY - 12;
  const cardH2 = Math.min(maxCardH2, Math.max(cardH, contenidoAbajo + 20));

  doc.save();
  doc.roundedRect(cardX2, cardY, cardW2, cardH2, 18).clip();
  doc.rect(cardX2, cardY, cardW2, cardH2).fill("#182a46");
  doc.rect(cardX2, cardY, cardW2, 4).fill(COLORS.accent);
  doc.restore();
  doc.roundedRect(cardX2, cardY, cardW2, cardH2, 18).lineWidth(1.3).strokeColor("#2c4468").stroke();
  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.accent)
    .text(cliente.esMultiPanel ? "PANELES" : "UBICACION", cardX2 + 30, cardY + 22, { characterSpacing: 1.5 });
  doc.font("Helvetica-Bold").fontSize(lugarSize).fillColor(COLORS.white).text(lugar, cardX2 + 30, cardY + lugarY, { width: innerW2 });
  if (resto) {
    doc.font("Helvetica").fontSize(restoSize).fillColor(COLORS.muted).text(resto, cardX2 + 30, cardY + restoY, { width: innerW2 });
  }

  drawFooterLine(doc, "01", true);
}

async function paginaEvidenciaBlanca(
  doc: PDFKit.PDFDocument,
  foto: { url: string; fecha?: string },
  pageNum: number,
  indice: number
) {
  doc.rect(0, 0, PAGE.width, PAGE.height).fill(COLORS.white);
  doc.image(LOGO_PLAYER_BLACK, PAGE.width - PAGE.margin - 200, 52, { width: 200 });

  drawKicker(doc, `${pad2(pageNum)} / EVIDENCIA`, PAGE.margin, 62);
  doc.font("Helvetica-Bold").fontSize(30).fillColor(COLORS.ink)
    .text("Reporte Fotografico", PAGE.margin, 98, { width: 760 });
  doc.font("Helvetica").fontSize(14).fillColor(COLORS.mutedOnLight)
    .text("Fotografia enviada como evidencia de campaña.", PAGE.margin, 138, { width: 760 });

  // Medidas calcadas de la referencia: foto x:74 y:212 w:996 h:529 aprox.
  const photoX = 74;
  const photoY = 195;
  const photoW = 996;
  const photoH = 546;
  const buffer = await cargarFotoComprimida(foto.url);
  drawImageCover(doc, buffer, photoX, photoY, photoW, photoH, 22);
  doc.roundedRect(photoX, photoY, photoW, photoH, 22).lineWidth(1).strokeColor(COLORS.lineLight).stroke();

  // Tarjeta oscura flotante, centrada verticalmente frente a la foto,
  // con todo el contenido centrado (calcado de x:1172-1518 y:386-655),
  // con la linea de acento azul arriba (recortada al radio de la tarjeta).
  const cardW = 346;
  const cardH = 269;
  const cardX = 1518 - cardW;
  const cardY = photoY + (photoH - cardH) / 2;
  const cx = cardX + cardW / 2;
  doc.save();
  doc.roundedRect(cardX, cardY, cardW, cardH, 18).clip();
  doc.rect(cardX, cardY, cardW, cardH).fill(COLORS.card);
  doc.rect(cardX, cardY, cardW, 5).fill(COLORS.accent);
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(11.5).fillColor(COLORS.accent2)
    .text("REPORTE FOTOGRAFICO", cardX, cardY + 30, { width: cardW, align: "center", characterSpacing: 1.5 });
  doc.font("Helvetica-Bold").fontSize(19).fillColor(COLORS.white)
    .text(`Evidencia ${indice}`, cardX, cardY + 58, { width: cardW, align: "center" });
  doc.font("Helvetica").fontSize(12).fillColor(COLORS.muted)
    .text("Presencia confirmada en punto de exhibicion.", cardX + 20, cardY + 92, { width: cardW - 40, align: "center" });
  doc.moveTo(cx - 60, cardY + 158).lineTo(cx + 60, cardY + 158).lineWidth(1.5).strokeColor(COLORS.accent2).stroke();
  doc.font("Helvetica-Bold").fontSize(11.5).fillColor(COLORS.accent2)
    .text("FECHA DE REGISTRO", cardX, cardY + 178, { width: cardW, align: "center", characterSpacing: 1.5 });
  doc.font("Helvetica-Bold").fontSize(17).fillColor(COLORS.white)
    .text(fechaCorta(foto.fecha), cardX, cardY + 202, { width: cardW, align: "center" });

  drawFooterBar(doc, pad2(pageNum));
}

async function paginaEvidenciaOscura(
  doc: PDFKit.PDFDocument,
  foto: { url: string; fecha?: string },
  pageNum: number,
  indice: number
) {
  doc.rect(0, 0, PAGE.width, PAGE.height).fill(COLORS.bg);
  doc.image(LOGO_PLAYER_WHITE, PAGE.width - PAGE.margin - 200, 52, { width: 200 });

  drawKicker(doc, `${pad2(pageNum)} / EVIDENCIA`, PAGE.margin, 62);
  doc.font("Helvetica-Bold").fontSize(30).fillColor(COLORS.white)
    .text("Reporte Fotografico", PAGE.margin, 98, { width: 760 });
  doc.font("Helvetica").fontSize(14).fillColor(COLORS.muted)
    .text("Fotografia enviada como evidencia de campaña.", PAGE.margin, 138, { width: 760 });

  // Misma composicion que la pagina blanca (foto + tarjeta flotante a
  // la derecha), pero con la tarjeta en blanco para que resalte contra
  // el fondo oscuro (en la pagina blanca la tarjeta es oscura).
  const photoX = 74;
  const photoY = 195;
  const photoW = 996;
  const photoH = 546;
  const buffer = await cargarFotoComprimida(foto.url);
  drawImageCover(doc, buffer, photoX, photoY, photoW, photoH, 22);
  doc.roundedRect(photoX, photoY, photoW, photoH, 22).lineWidth(1).strokeColor(COLORS.line).stroke();

  const cardW = 346;
  const cardH = 269;
  const cardX = 1518 - cardW;
  const cardY = photoY + (photoH - cardH) / 2;
  const cx = cardX + cardW / 2;
  doc.save();
  doc.roundedRect(cardX, cardY, cardW, cardH, 18).clip();
  doc.rect(cardX, cardY, cardW, cardH).fill(COLORS.white);
  doc.rect(cardX, cardY, cardW, 5).fill(COLORS.accent);
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(11.5).fillColor(COLORS.accent)
    .text("REPORTE FOTOGRAFICO", cardX, cardY + 30, { width: cardW, align: "center", characterSpacing: 1.5 });
  doc.font("Helvetica-Bold").fontSize(19).fillColor(COLORS.ink)
    .text(`Evidencia ${indice}`, cardX, cardY + 58, { width: cardW, align: "center" });
  doc.font("Helvetica").fontSize(12).fillColor(COLORS.mutedOnLight)
    .text("Presencia confirmada en punto de exhibicion.", cardX + 20, cardY + 92, { width: cardW - 40, align: "center" });
  doc.moveTo(cx - 60, cardY + 158).lineTo(cx + 60, cardY + 158).lineWidth(1.5).strokeColor(COLORS.accent).stroke();
  doc.font("Helvetica-Bold").fontSize(11.5).fillColor(COLORS.accent)
    .text("FECHA DE REGISTRO", cardX, cardY + 178, { width: cardW, align: "center", characterSpacing: 1.5 });
  doc.font("Helvetica-Bold").fontSize(17).fillColor(COLORS.ink)
    .text(fechaCorta(foto.fecha), cardX, cardY + 202, { width: cardW, align: "center" });

  drawFooterLine(doc, pad2(pageNum), true, false);
}

/** Datos de contacto de Vista360 para el pie de la pagina de cierre.
 *  TODO: mover esto a config/Firestore si se necesita cambiar sin
 *  tocar codigo. Por ahora son valores de prueba. */
const CONTACTO_EMAIL = "ochomillas.101@hotmail.com";
const CONTACTO_TELEFONO = "+51 947 957 971";
const CONTACTO_WEB = "www.vista360.pe";

/** Icono simple de sobre/correo, dibujado con lineas (sin depender de
 *  fuentes con glifos de icono). */
function drawEmailIcon(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, color: string) {
  doc.roundedRect(x, y, w, h, 2.5).lineWidth(2).strokeColor(color).stroke();
  doc.moveTo(x + 3, y + 4)
    .lineTo(x + w / 2, y + h / 2 + 3)
    .lineTo(x + w - 3, y + 4)
    .lineWidth(2).strokeColor(color).stroke();
}

/** Icono simple de telefono movil (cuerpo redondeado + altavoz arriba). */
function drawPhoneIcon(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, color: string) {
  doc.roundedRect(x, y, w, h, h * 0.24).lineWidth(2).strokeColor(color).stroke();
  doc.moveTo(x + w * 0.32, y + h * 0.16).lineTo(x + w * 0.68, y + h * 0.16).lineWidth(2).strokeColor(color).stroke();
}

/** Icono simple de globo/pagina web (circulo + ecuador + meridiano),
 *  mismo estilo de trazo que el sobre y el telefono. */
function drawWebIcon(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, color: string) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) / 2;
  doc.circle(cx, cy, r).lineWidth(2).strokeColor(color).stroke();
  doc.moveTo(x, cy).lineTo(x + w, cy).lineWidth(2).strokeColor(color).stroke();
  doc.ellipse(cx, cy, r * 0.45, r).lineWidth(2).strokeColor(color).stroke();
}

function cierre(doc: PDFKit.PDFDocument, totalPages: number) {
  // Cierre: fondo oscuro solido + anillo de marca (diseño original --
  // se probo un fondo con foto de ciudad y no se queria, se revirtio).
  doc.rect(0, 0, PAGE.width, PAGE.height).fill(COLORS.bg);
  drawRingAsset(doc, 1001, 0, 599);

  // Todo el bloque alineado a la izquierda: logo, frase, raya
  // divisoria y contacto, uno debajo del otro. Todo mas grande que
  // antes (logo, textos, raya) y el correo/telefono cada uno en su
  // propia linea con su icono.
  const leftX = PAGE.margin;
  let y = PAGE.height * 0.24;

  const logoW = 420;
  doc.image(LOGO_WORDMARK_WHITE, leftX, y, { width: logoW });
  y += 130;

  doc.font("Helvetica-Bold").fontSize(42).fillColor(COLORS.white)
    .text("Publicidad exterior premium", leftX, y, { width: 900 });
  y += 58;
  doc.font("Helvetica").fontSize(18).fillColor(COLORS.muted)
    .text("Presencia que impacta. Evidencia que respalda. Marca que se recuerda.", leftX, y, { width: 760 });
  y += 62;

  doc.moveTo(leftX, y).lineTo(leftX + 320, y).lineWidth(3).strokeColor(COLORS.accent2).stroke();
  y += 40;

  doc.font("Helvetica-Bold").fontSize(15).fillColor(COLORS.accent)
    .text("CONTACTO", leftX, y, { characterSpacing: 1.5 });
  y += 34;

  drawEmailIcon(doc, leftX, y + 4, 26, 19, COLORS.accent2);
  doc.font("Helvetica-Bold").fontSize(24).fillColor(COLORS.white)
    .text(CONTACTO_EMAIL, leftX + 40, y);
  y += 52;

  drawPhoneIcon(doc, leftX + 3, y + 2, 20, 24, COLORS.accent2);
  doc.font("Helvetica-Bold").fontSize(24).fillColor(COLORS.white)
    .text(CONTACTO_TELEFONO, leftX + 40, y);
  y += 52;

  drawWebIcon(doc, leftX + 2, y + 3, 22, 22, COLORS.accent2);
  doc.font("Helvetica-Bold").fontSize(24).fillColor(COLORS.white)
    .text(CONTACTO_WEB, leftX + 40, y);

  doc.font("Helvetica").fontSize(10.5).fillColor(COLORS.muted)
    .text("VISTA360 - REPORTE FOTOGRAFICO", PAGE.margin, PAGE.height - 40, { characterSpacing: 1 });
  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLORS.white)
    .text(pad2(totalPages), PAGE.width - PAGE.margin - 40, PAGE.height - 40, { width: 40, align: "right" });
}

/** Pagina divisoria entre paneles de una misma campaña multi-panel --
 *  mismo lenguaje visual que portada/cierre (fondo oscuro + anillo de
 *  marca), asi el reporte se siente diseñado a proposito y no como una
 *  lista de fotos pegadas. Solo se usa cuando hay 2+ paneles en el
 *  reporte -- con un solo panel/elemento no hace falta anunciarlo.
 *
 *  OJO: esta version (fondo oscuro + anillo) se usa para el panel 2 en
 *  adelante -- para el PRIMER panel se usa paginaPrimerPanel() en vez
 *  de esta, porque queda pegada justo despues de la portada (que tiene
 *  este mismo estilo) y se sentia como una repeticion inmediata en vez
 *  de una seccion nueva. Del segundo panel en adelante, como ya hubo
 *  paginas de evidencia blancas/oscuras en el medio, este mismo estilo
 *  SI se lee como "vuelve el diseño de portada para anunciar algo
 *  nuevo" en vez de repetitivo.
 */
/** Divisoria de panel -- fondo azul solido a todo lo ancho, con una
 *  franja BLANCA a todo el alto a la izquierda (invertido: antes era
 *  al reves, fondo blanco con franja azul). Mismo diseño para
 *  cualquier panel de la campaña (antes el primero y el resto se veian
 *  distintos -- ahora todos usan exactamente este mismo diseño). La
 *  barra oscura del pie de pagina no cambia, sigue negra. */
function paginaPanel(doc: PDFKit.PDFDocument, nombrePanel: string, ubicacion: string, pageNum: number, indiceSeccion: number, totalSecciones: number) {
  doc.rect(0, 0, PAGE.width, PAGE.height).fill(COLORS.accent);

  const barW = 26;
  doc.rect(0, 0, barW, PAGE.height).fill(COLORS.white);

  doc.image(LOGO_PLAYER_WHITE_MONO, PAGE.width - PAGE.margin - 200, 52, { width: 200 });

  const leftX = barW + 58;
  const y0 = PAGE.height * 0.34;
  drawKicker(doc, `Panel ${indiceSeccion} de ${totalSecciones}`, leftX, y0, COLORS.white, 16);

  const maxWidth = PAGE.width - leftX - PAGE.margin - 220;
  const titulo = sinTildes(nombrePanel).toUpperCase();
  const tituloSize = tamanoQueEntra(doc, titulo, maxWidth, "Helvetica-Bold", 64, 32);
  doc.font("Helvetica-Bold").fontSize(tituloSize).fillColor(COLORS.white)
    .text(titulo, leftX, y0 + 42, { width: maxWidth });

  const tituloHeight = doc.heightOfString(titulo, { width: maxWidth });
  if (ubicacion && sinTildes(ubicacion) !== titulo) {
    // Blanco con opacidad reducida en vez de accent2 -- accent2 (azul
    // claro) sobre el fondo azul de esta pagina practicamente no se
    // veia (muy poco contraste). Blanco semi-transparente si contrasta
    // bien y se sigue leyendo como texto secundario, no tan fuerte
    // como el titulo de arriba.
    doc.save();
    doc.fillOpacity(0.72);
    doc.font("Helvetica").fontSize(19).fillColor(COLORS.white)
      .text(sinTildes(ubicacion), leftX, y0 + 42 + tituloHeight + 16, { width: maxWidth });
    doc.restore();
  }

  doc.moveTo(leftX, y0 - 24).lineTo(leftX + 90, y0 - 24).lineWidth(3).strokeColor(COLORS.white).stroke();

  drawFooterBar(doc, pad2(pageNum), COLORS.accentDark);
}

export async function generarReporte(cliente: ClienteReporte, elementos: ReporteElemento[]): Promise<ReportePdf> {
  const doc = new PDFDocument({ size: [PAGE.width, PAGE.height], margin: 0, autoFirstPage: false });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  doc.addPage();
  portada(doc, cliente);

  // Elementos con al menos una foto -- si un panel se eligió pero no se
  // le subió ninguna foto, no genera una sección vacía en el PDF.
  const elementosConFotos = elementos.filter((elemento) => elemento.fotos.filter(Boolean).length > 0);
  // Encabezado de sección por panel SOLO si el reporte junta 2+ paneles
  // -- con un solo panel/elemento, el reporte sigue viéndose igual que
  // siempre (sin una portadilla de más).
  const conSecciones = elementosConFotos.length > 1;

  let pageNum = 2;
  let numEvidencias = 0;
  for (let s = 0; s < elementosConFotos.length; s++) {
    const elemento = elementosConFotos[s];
    if (conSecciones) {
      doc.addPage();
      paginaPanel(doc, elemento.titulo, elemento.ubicacion ?? "", pageNum, s + 1, elementosConFotos.length);
      pageNum++;
    }

    const fotosElemento = elemento.fotos.filter(Boolean).map((foto) => {
      const f = normalizeFoto(foto);
      return { url: f.url, fecha: f.fecha };
    });

    for (let i = 0; i < fotosElemento.length; i++) {
      doc.addPage();
      // Empieza en blanco y alterna: blanco, negro, blanco, negro...
      // (se reinicia por cada panel, para que cada sección arranque
      // siempre en la misma página blanca de bienvenida)
      const dark = i % 2 === 1;
      if (dark) {
        await paginaEvidenciaOscura(doc, fotosElemento[i], pageNum, i + 1);
      } else {
        await paginaEvidenciaBlanca(doc, fotosElemento[i], pageNum, i + 1);
      }
      pageNum++;
      numEvidencias++;
    }
  }

  doc.addPage();
  cierre(doc, pageNum);
  doc.end();

  await new Promise<void>((resolve, reject) => {
    doc.on("end", resolve);
    doc.on("error", reject);
  });

  return {
    buffer: Buffer.concat(chunks),
    numEvidencias,
    numElementos: elementosConFotos.length,
  };
}

async function subirReporteR2(key: string, buffer: Buffer) {
  await subirBufferR2(key, buffer, "application/pdf");
  // Bucket privado: la URL real se firma bajo demanda (6h) al listar
  // reportes en el frontend, no se guarda una URL pública permanente.
  return firmarLecturaR2(key, 6 * 60 * 60);
}

async function cargarElementos(clienteId: string, mes: string, panelId?: string) {
  const db = getFirestore();
  const { start, end } = monthRange(mes);
  let contratosQuery = db
    .collection("contratos")
    .where("cliente_id", "==", clienteId) as FirebaseFirestore.Query;
  if (panelId) {
    contratosQuery = contratosQuery.where("panel_id", "==", panelId);
  }
  const contratosSnap = await contratosQuery.get();

  const panelIds = new Set<string>();
  contratosSnap.docs.forEach((doc) => {
    const panelId = doc.data().panel_id;
    if (panelId) panelIds.add(panelId);
  });

  const paneles = new Map<string, FirebaseFirestore.DocumentData>();
  await Promise.all(
    [...panelIds].map(async (panelId) => {
      const panel = await db.doc(`paneles/${panelId}`).get();
      if (panel.exists) paneles.set(panelId, panel.data() ?? {});
    })
  );

  return contratosSnap.docs.flatMap((doc) => {
    const contrato = doc.data();
    if (contrato.deleted) return [];
    const panel = paneles.get(contrato.panel_id) ?? {};
    const fotos = ((contrato.fotos_campania ?? []) as FotoInput[])
      .map(normalizeFoto)
      .filter((foto) => {
        const fecha = timestampToIso(foto.fecha);
        return foto.url && (!fecha || (fecha >= start && fecha <= end));
      });
    if (fotos.length === 0) return [];
    const ubicacion = [panel.nombre, panel.direccion, panel.ciudad].filter(Boolean).join(" - ");
    return [{
      titulo: "Evidencia de campaña",
      ubicacion,
      fotos,
    }];
  });
}

async function cargarUbicacionCliente(clienteId: string, panelId?: string) {
  const db = getFirestore();
  let panelIdUsado = panelId;
  if (!panelIdUsado) {
    const contratosSnap = await db
      .collection("contratos")
      .where("cliente_id", "==", clienteId)
      .limit(1)
      .get();
    panelIdUsado = contratosSnap.docs[0]?.data().panel_id;
  }
  if (!panelIdUsado) return "";
  const panelSnap = await db.doc(`paneles/${panelIdUsado}`).get();
  const panel = panelSnap.data() ?? {};
  return [panel.nombre, panel.direccion, panel.ciudad].filter(Boolean).join(" - ");
}

function cargarElementosSubidos(data: unknown, ubicacion: string): ReporteElemento[] {
  if (!Array.isArray(data)) return [];
  const fotos = data
    .map(normalizeFoto)
    .filter((foto) => typeof foto.url === "string" && foto.url.startsWith("data:image/"))
    .slice(0, 12);
  return [{
    titulo: "Evidencia de campaña",
    ubicacion,
    fotos,
  }];
}

interface PanelFotosInput {
  panelId?: string;
  panelNombre?: string;
  fotos?: FotoInput[];
}

/** Reporte organizado POR CAMPAÑA cuando esta tiene 2+ paneles: cada
 *  entrada de "paneles" trae sus propias fotos ya subidas (una cajita
 *  de carga por panel en Reportes.tsx) -- acá se arma un ReporteElemento
 *  por panel, buscando nombre/dirección/ciudad real en Firestore para
 *  que la sección de cada uno salga bien identificada en el PDF. */
async function cargarElementosSubidosPorPanel(
  db: FirebaseFirestore.Firestore,
  data: unknown
): Promise<ReporteElemento[]> {
  if (!Array.isArray(data)) return [];
  const elementos: ReporteElemento[] = [];
  for (const entradaRaw of data as PanelFotosInput[]) {
    if (!entradaRaw || typeof entradaRaw !== "object") continue;
    const panelId = String(entradaRaw.panelId ?? "").trim();
    const fotos = (Array.isArray(entradaRaw.fotos) ? entradaRaw.fotos : [])
      .map(normalizeFoto)
      .filter((foto) => typeof foto.url === "string" && foto.url.startsWith("data:image/"))
      .slice(0, 12);
    if (fotos.length === 0) continue;

    let nombre = String(entradaRaw.panelNombre ?? "").trim();
    let ubicacion = nombre;
    if (panelId) {
      const panelSnap = await db.doc(`paneles/${panelId}`).get();
      const panel = panelSnap.exists ? panelSnap.data() ?? {} : {};
      if (!nombre) nombre = String(panel.nombre ?? "Panel");
      ubicacion = [panel.nombre ?? nombre, panel.direccion, panel.ciudad].filter(Boolean).join(" - ");
    }
    elementos.push({
      titulo: nombre || "Panel",
      ubicacion: ubicacion || nombre || "Panel",
      fotos,
      ...(panelId ? { panelId } : {}),
    });
  }
  return elementos;
}

export const generarReporteCliente = onCall(
  { timeoutSeconds: 540, memory: "1GiB", secrets: R2_SECRETS },
  async (request) => {
    try {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

      const db = getFirestore();
      const userSnap = await db.doc(`portalUsers/${uid}`).get();
      const user = userSnap.data();
      if (!userSnap.exists || user?.role !== "admin") {
        throw new HttpsError("permission-denied", "Solo la cuenta admin puede generar reportes.");
      }

      const clienteId = String(request.data?.clienteId ?? "");
      const mes = String(request.data?.mes ?? new Date().toISOString().slice(0, 7));
      if (!clienteId || !/^\d{4}-\d{2}$/.test(mes)) {
        throw new HttpsError("invalid-argument", "Envía clienteId y mes en formato YYYY-MM.");
      }

      // Se puede generar mas de un reporte en el mismo mes, siempre que
      // sea en dias distintos (cada dia es un reporte propio) -- si se
      // genera dos veces el MISMO dia, se sobreescribe el de ese dia
      // (mismo id/key), no se acumulan copias.
      const diaInput = String(request.data?.dia ?? "").padStart(2, "0");
      const diaValido = /^\d{2}$/.test(diaInput) ? diaInput : String(new Date().getDate()).padStart(2, "0");
      const fecha = `${mes}-${diaValido}`;
      if (Number.isNaN(new Date(`${fecha}T00:00:00`).getTime())) {
        throw new HttpsError("invalid-argument", "El día enviado no es válido para ese mes.");
      }

      const panelId = String(request.data?.panelId ?? "").trim();
      const contratoId = String(request.data?.contratoId ?? "").trim();

      const clienteSnap = await db.doc(`clientes/${clienteId}`).get();
      if (!clienteSnap.exists) throw new HttpsError("not-found", "Cliente no encontrado.");
      const clienteData = clienteSnap.data() ?? {};
      const ubicacionDb = String(clienteData.ciudad ?? "");

      // Nombre de la campaña puesto a mano por el admin (si lo tiene) --
      // se guarda junto con el reporte para que la notificación push y
      // cualquier lista de reportes puedan decir "Campaña Verano 2026"
      // en vez de solo la fecha. Campañas viejas sin nombre siguen sin
      // mostrar nada especial acá (se resuelve con los títulos de los
      // paneles más abajo, una vez armado `elementos`).
      const contratoNombreManual = contratoId
        ? String((await db.doc(`contratos/${contratoId}`).get()).data()?.nombre ?? "").trim()
        : "";

      // Reporte organizado por campaña (2+ paneles, uno o mas cuadros
      // de fotos por panel) -- si viene esto, tiene prioridad sobre el
      // flujo viejo de "fotos" plano / panel único.
      const elementosPorPanel = await cargarElementosSubidosPorPanel(db, request.data?.panelesFotos);

      let elementos: ReporteElemento[];
      let ubicacion: string;
      if (elementosPorPanel.length > 0) {
        elementos = elementosPorPanel;
        ubicacion = elementosPorPanel.map((e) => e.titulo).join(" + ") || ubicacionDb || "Perú";
      } else {
        const ubicacionPanel = await cargarUbicacionCliente(clienteId, panelId || undefined);
        ubicacion = ubicacionPanel || ubicacionDb || "Perú";
        const elementosSubidos = cargarElementosSubidos(request.data?.fotos, ubicacion);
        elementos = elementosSubidos.length > 0 && elementosSubidos[0].fotos.length > 0
          ? elementosSubidos
          : await cargarElementos(clienteId, mes, panelId || undefined);
      }
      if (elementos.length === 0 || elementos.every((e) => e.fotos.length === 0)) {
        throw new HttpsError(
          "failed-precondition",
          panelId ? "Ese panel no tiene fotos de campaña para este mes." : "Agrega fotos para generar el reporte."
        );
      }

      // Nombre final para mostrar/notificar: el que puso el admin a
      // mano en la campaña, o si no tiene, los nombres de sus paneles
      // unidos (mismo criterio que ya usa el portal en MisCampanas.tsx
      // y DetalleCampana.tsx para el título).
      const contratoNombre = contratoNombreManual || elementos.map((e) => e.titulo).join(" + ") || undefined;

      // Qué paneles de la campaña quedaron con fotos en ESTE reporte
      // (solo se llena en el flujo por campaña, panelId viene de
      // cargarElementosSubidosPorPanel) -- MisCampanas.tsx lo usa para
      // la barra de estado del mes, para poder decir "falta el panel
      // X" en vez de solo "falta el informe" cuando la campaña tiene
      // 2+ paneles.
      const panelesIncluidos = elementos.map((e) => e.panelId).filter((id): id is string => Boolean(id));

      const cliente: ClienteReporte = {
        id: clienteId,
        nombre: String(clienteData.empresa ?? clienteData.nombre ?? "Cliente"),
        esMultiPanel: elementosPorPanel.length > 1,
        periodo: nombreMes(mes),
        ubicacion,
        ciudad: ubicacionDb || "Peru",
      };

      // Un solo PDF por reporte (ya no se genera una version "HD"
      // aparte): duplicaba el espacio ocupado en R2 sin que nadie
      // usara la version pesada. La compresion de fotos en
      // FOTO_CONFIG ya deja este archivo liviano y con buena calidad.
      const reporte = await generarReporte(cliente, elementos);
      const digital = reporte.buffer;

      const baseKey = `clientes/${clienteId}/reportes/${mes}/${diaValido}`;
      const keyDigital = `${baseKey}/reporte-digital.pdf`;
      const urlDigital = await subirReporteR2(keyDigital, digital);

      await db.collection("informesCliente").doc(`${clienteId}_${fecha}`).set(
        {
          cliente_id: clienteId,
          mes,
          dia: diaValido,
          fecha,
          mesLabel: nombreFechaCorta(fecha),
          url: urlDigital,
          urlDigital,
          storage: "r2",
          r2Keys: {
            digital: keyDigital,
          },
          digitalBytes: digital.length,
          numCampanas: reporte.numElementos,
          numEvidencias: reporte.numEvidencias,
          ...(panelId ? { panel_id: panelId } : { panel_id: FieldValue.delete() }),
          ...(contratoId ? { contrato_id: contratoId } : { contrato_id: FieldValue.delete() }),
          ...(contratoNombre ? { contratoNombre } : { contratoNombre: FieldValue.delete() }),
          ...(panelesIncluidos.length > 0 ? { panelesIncluidos } : { panelesIncluidos: FieldValue.delete() }),
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        ok: true,
        url: urlDigital,
        bytes: digital.length,
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error("Error inesperado al generar el reporte.", error);
      const detail = error instanceof Error ? error.message : "Error desconocido";
      throw new HttpsError("internal", `No se pudo generar el PDF: ${detail}`);
    }
  }
);
