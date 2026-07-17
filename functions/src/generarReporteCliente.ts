import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
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
}

interface ClienteReporte {
  id: string;
  nombre: string;
  periodo: string;
  ubicacion: string;
  ciudad: string;
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
};

const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
const LOGO_WORDMARK_WHITE = join(ASSETS_DIR, "logos/vista360-wordmark-white.png");
const RING_PORTADA = join(ASSETS_DIR, "decor/ring-portada.png");
const LOGO_PLAYER_WHITE = join(ASSETS_DIR, "logos/vista360-player-white.png");
const LOGO_PLAYER_BLACK = join(ASSETS_DIR, "logos/vista360-player-black.png");
const CIERRE_BG = join(ASSETS_DIR, "backgrounds/ciudad-noche.jpg");

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
 *  103px con una linea de acento azul de 5px justo encima, a todo el ancho. */
function drawFooterBar(doc: PDFKit.PDFDocument, num: string) {
  const barH = 103;
  const barY = PAGE.height - barH;
  doc.rect(0, barY - 5, PAGE.width, 5).fill(COLORS.accent);
  doc.rect(0, barY, PAGE.width, barH).fill(COLORS.bg);
  doc.font("Helvetica").fontSize(10.5).fillColor(COLORS.muted)
    .text("VISTA360 - REPORTE FOTOGRAFICO", PAGE.margin, barY + (barH - 11) / 2, { characterSpacing: 1 });
  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLORS.white)
    .text(num, PAGE.width - PAGE.margin - 40, barY + (barH - 11) / 2, { width: 40, align: "right" });
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
  // que la tarjeta flotante de las paginas de evidencia.
  const cardX2 = 1012;
  const cardW2 = 418;
  doc.save();
  doc.roundedRect(cardX2, cardY, cardW2, cardH, 18).clip();
  doc.rect(cardX2, cardY, cardW2, cardH).fill("#182a46");
  doc.rect(cardX2, cardY, cardW2, 4).fill(COLORS.accent);
  doc.restore();
  doc.roundedRect(cardX2, cardY, cardW2, cardH, 18).lineWidth(1.3).strokeColor("#2c4468").stroke();
  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.accent).text("UBICACION", cardX2 + 30, cardY + 22, { characterSpacing: 1.5 });
  const [lugar, ...resto] = sinTildes(cliente.ubicacion).split(" - ");
  doc.font("Helvetica-Bold").fontSize(18).fillColor(COLORS.white).text(lugar || sinTildes(cliente.ubicacion), cardX2 + 30, cardY + 46, { width: cardW2 - 60 });
  if (resto.length > 0) {
    doc.font("Helvetica").fontSize(13).fillColor(COLORS.muted).text(resto.join(", "), cardX2 + 30, cardY + 72, { width: cardW2 - 60 });
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
    .text("Fotografia enviada como evidencia de campana.", PAGE.margin, 138, { width: 760 });

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
    .text("Evidencia clara del soporte instalado.", cardX + 24, cardY + 92, { width: cardW - 48, align: "center" });
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
    .text("Fotografia enviada como evidencia de campana.", PAGE.margin, 138, { width: 760 });

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
    .text("Evidencia clara del soporte instalado.", cardX + 24, cardY + 92, { width: cardW - 48, align: "center" });
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
const CONTACTO_EMAIL = "contacto@vista360.pe";
const CONTACTO_TELEFONO = "+51 987 654 321";

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

function cierre(doc: PDFKit.PDFDocument, totalPages: number) {
  if (existsSync(CIERRE_BG)) {
    drawImageCover(doc, CIERRE_BG, 0, 0, PAGE.width, PAGE.height, 0);
    const overlay = doc.linearGradient(0, PAGE.height * 0.3, 0, PAGE.height);
    overlay.stop(0, "#000000", 0).stop(1, "#000000", 0.72);
    doc.rect(0, 0, PAGE.width, PAGE.height).fill(overlay as never);
  } else {
    doc.rect(0, 0, PAGE.width, PAGE.height).fill(COLORS.bg);
    drawRingAsset(doc, 1001, 0, 599);
  }

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
    .text("Presencia visual, evidencia clara y marca visible.", leftX, y, { width: 700 });
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

  doc.font("Helvetica").fontSize(10.5).fillColor(COLORS.muted)
    .text("VISTA360 - REPORTE FOTOGRAFICO", PAGE.margin, PAGE.height - 40, { characterSpacing: 1 });
  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLORS.white)
    .text(pad2(totalPages), PAGE.width - PAGE.margin - 40, PAGE.height - 40, { width: 40, align: "right" });
}

export async function generarReporte(cliente: ClienteReporte, elementos: ReporteElemento[]): Promise<ReportePdf> {
  const doc = new PDFDocument({ size: [PAGE.width, PAGE.height], margin: 0, autoFirstPage: false });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  doc.addPage();
  portada(doc, cliente);

  const fotosFlat = elementos.flatMap((elemento) =>
    elemento.fotos.filter(Boolean).map((foto) => {
      const f = normalizeFoto(foto);
      return { url: f.url, fecha: f.fecha, ubicacion: elemento.ubicacion };
    })
  );

  let pageNum = 2;
  for (let i = 0; i < fotosFlat.length; i++) {
    doc.addPage();
    // Empieza en blanco y alterna: blanco, negro, blanco, negro...
    const dark = i % 2 === 1;
    if (dark) {
      await paginaEvidenciaOscura(doc, fotosFlat[i], pageNum, i + 1);
    } else {
      await paginaEvidenciaBlanca(doc, fotosFlat[i], pageNum, i + 1);
    }
    pageNum++;
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
    numEvidencias: fotosFlat.length,
    numElementos: elementos.length,
  };
}

async function subirReporteR2(key: string, buffer: Buffer) {
  await subirBufferR2(key, buffer, "application/pdf");
  // Bucket privado: la URL real se firma bajo demanda (6h) al listar
  // reportes en el frontend, no se guarda una URL pública permanente.
  return firmarLecturaR2(key, 6 * 60 * 60);
}

async function cargarElementos(clienteId: string, mes: string) {
  const db = getFirestore();
  const { start, end } = monthRange(mes);
  const contratosSnap = await db
    .collection("contratos")
    .where("cliente_id", "==", clienteId)
    .get();

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

async function cargarUbicacionCliente(clienteId: string) {
  const db = getFirestore();
  const contratosSnap = await db
    .collection("contratos")
    .where("cliente_id", "==", clienteId)
    .limit(1)
    .get();
  const panelId = contratosSnap.docs[0]?.data().panel_id;
  if (!panelId) return "";
  const panelSnap = await db.doc(`paneles/${panelId}`).get();
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

      const clienteSnap = await db.doc(`clientes/${clienteId}`).get();
      if (!clienteSnap.exists) throw new HttpsError("not-found", "Cliente no encontrado.");
      const clienteData = clienteSnap.data() ?? {};
      const ubicacionDb = String(clienteData.ciudad ?? "");
      const ubicacionPanel = await cargarUbicacionCliente(clienteId);
      const ubicacion = ubicacionPanel || ubicacionDb || "Perú";
      const elementosSubidos = cargarElementosSubidos(request.data?.fotos, ubicacion);
      const elementos = elementosSubidos.length > 0 && elementosSubidos[0].fotos.length > 0
        ? elementosSubidos
        : await cargarElementos(clienteId, mes);
      if (elementos.length === 0) {
        throw new HttpsError("failed-precondition", "Agrega fotos para generar el reporte.");
      }

      const cliente: ClienteReporte = {
        id: clienteId,
        nombre: String(clienteData.empresa ?? clienteData.nombre ?? "Cliente"),
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

      const baseKey = `clientes/${clienteId}/reportes/${mes}`;
      const keyDigital = `${baseKey}/reporte-digital.pdf`;
      const urlDigital = await subirReporteR2(keyDigital, digital);

      await db.collection("informesCliente").doc(`${clienteId}_${mes}`).set(
        {
          cliente_id: clienteId,
          mes,
          mesLabel: cliente.periodo,
          url: urlDigital,
          urlDigital,
          storage: "r2",
          r2Keys: {
            digital: keyDigital,
          },
          digitalBytes: digital.length,
          numCampanas: reporte.numElementos,
          numEvidencias: reporte.numEvidencias,
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
