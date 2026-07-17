import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import PDFDocument from "pdfkit";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { R2_SECRETS, firmarLecturaR2, subirBufferR2 } from "./r2Storage.js";

if (getApps().length === 0) {
  initializeApp();
}

const execFileAsync = promisify(execFile);

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
const PAGE = { width: 1600, height: 900, margin: 56 };

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
const LOGO_PLAYER_WHITE = join(ASSETS_DIR, "logos/vista360-player-white.png");
const LOGO_PLAYER_BLACK = join(ASSETS_DIR, "logos/vista360-player-black.png");
const CIERRE_BG = join(ASSETS_DIR, "backgrounds/ciudad-noche.jpg");

const pad2 = (n: number) => String(n).padStart(2, "0");

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

/** Anillos decorativos de vidrio azul (portada / cierre de respaldo). */
function drawRings(doc: PDFKit.PDFDocument, cx: number, cy: number, maxR: number) {
  [maxR, maxR * 0.72, maxR * 0.46].forEach((r, i) => {
    const grad = doc.radialGradient(cx, cy, r * 0.7, cx, cy, r);
    grad.stop(0, COLORS.accent, 0.42 - i * 0.06).stop(1, COLORS.accent, 0);
    doc.circle(cx, cy, r).fill(grad as never);
  });
  [maxR * 0.99, maxR * 0.7, maxR * 0.44].forEach((r) => {
    doc.circle(cx, cy, r).lineWidth(1.3).strokeColor(COLORS.accent2).strokeOpacity(0.5).stroke();
  });
  doc.strokeOpacity(1);
}

function drawKicker(doc: PDFKit.PDFDocument, text: string, x: number, y: number, color = COLORS.accent) {
  const upper = text.toUpperCase();
  doc.font("Helvetica-Bold").fontSize(14).fillColor(color).text(upper, x, y, { characterSpacing: 2 });
  const w = doc.widthOfString(upper, { characterSpacing: 2 });
  doc.moveTo(x, y + 22).lineTo(x + Math.min(w, 84), y + 22).lineWidth(2).strokeColor(color).stroke();
}

function drawFooter(doc: PDFKit.PDFDocument, num: string, dark: boolean) {
  const y = PAGE.height - 44;
  doc.moveTo(PAGE.margin, y).lineTo(PAGE.width - PAGE.margin, y).lineWidth(1)
    .strokeColor(dark ? COLORS.line : COLORS.lineLight).stroke();
  doc.font("Helvetica").fontSize(10.5).fillColor(dark ? COLORS.muted : COLORS.mutedOnLight)
    .text("VISTA360 · REPORTE FOTOGRÁFICO", PAGE.margin, y + 12, { characterSpacing: 1 });
  doc.font("Helvetica-Bold").fontSize(11).fillColor(dark ? COLORS.white : COLORS.ink)
    .text(num, PAGE.width - PAGE.margin - 40, y + 12, { width: 40, align: "right" });
}

function portada(doc: PDFKit.PDFDocument, cliente: ClienteReporte) {
  doc.rect(0, 0, PAGE.width, PAGE.height).fill(COLORS.bg);
  drawRings(doc, PAGE.width - 250, 220, 270);

  doc.image(LOGO_WORDMARK_WHITE, PAGE.margin, 54, { width: 220 });

  const ciudad = cliente.ubicacion.split(" - ").pop() || "Perú";
  drawKicker(doc, `Reporte mensual / ${ciudad}`, PAGE.margin, 196);

  doc.font("Helvetica-Bold").fontSize(64).fillColor(COLORS.white).text("REPORTE", PAGE.margin, 244, { characterSpacing: 0.5 });
  doc.font("Helvetica-Bold").fontSize(64).fillColor(COLORS.white).text("FOTOGRÁFICO", PAGE.margin, 316, { characterSpacing: 0.5 });

  const cardY = PAGE.height - 214;

  // Tarjeta blanca: Cliente / Período
  const cardW1 = 440;
  doc.roundedRect(PAGE.margin, cardY, cardW1, 132, 18).fill(COLORS.white);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.accent).text("CLIENTE", PAGE.margin + 30, cardY + 24, { characterSpacing: 1.5 });
  doc.font("Helvetica-Bold").fontSize(21).fillColor(COLORS.ink).text(cliente.nombre, PAGE.margin + 30, cardY + 46, { width: 190 });
  doc.moveTo(PAGE.margin + 230, cardY + 24).lineTo(PAGE.margin + 230, cardY + 108).lineWidth(1).strokeColor(COLORS.lineLight).stroke();
  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.accent).text("PERÍODO", PAGE.margin + 260, cardY + 24, { characterSpacing: 1.5 });
  doc.font("Helvetica-Bold").fontSize(21).fillColor(COLORS.ink).text(cliente.periodo, PAGE.margin + 260, cardY + 46, { width: 150 });

  // Tarjeta oscura: Ubicación
  const cardX2 = PAGE.margin + cardW1 + 32;
  const cardW2 = Math.min(420, PAGE.width - PAGE.margin - cardX2);
  doc.roundedRect(cardX2, cardY, cardW2, 132, 18).lineWidth(1.3).strokeColor(COLORS.line).stroke();
  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.accent).text("UBICACIÓN", cardX2 + 30, cardY + 24, { characterSpacing: 1.5 });
  const [lugar, ...resto] = cliente.ubicacion.split(" - ");
  doc.font("Helvetica-Bold").fontSize(17).fillColor(COLORS.white).text(lugar || cliente.ubicacion, cardX2 + 30, cardY + 48, { width: cardW2 - 60 });
  if (resto.length > 0) {
    doc.font("Helvetica").fontSize(13).fillColor(COLORS.muted).text(resto.join(", "), cardX2 + 30, cardY + 74, { width: cardW2 - 60 });
  }

  drawFooter(doc, "01", true);
}

async function paginaEvidencia(
  doc: PDFKit.PDFDocument,
  foto: { url: string; fecha?: string; ubicacion?: string },
  opts: { dark: boolean; pageNum: number }
) {
  const { dark, pageNum } = opts;
  const bg = dark ? COLORS.bg : COLORS.white;
  const ink = dark ? COLORS.white : COLORS.ink;
  const mutedColor = dark ? COLORS.muted : COLORS.mutedOnLight;

  doc.rect(0, 0, PAGE.width, PAGE.height).fill(bg);

  const logoImg = dark ? LOGO_PLAYER_WHITE : LOGO_PLAYER_BLACK;
  doc.image(logoImg, PAGE.width - PAGE.margin - 200, 52, { width: 200 });

  const kicker = dark ? "EVIDENCIA" : "REGISTRO";
  drawKicker(doc, `${pad2(pageNum)} / ${kicker}`, PAGE.margin, 62);
  doc.font("Helvetica-Bold").fontSize(30).fillColor(ink)
    .text(dark ? "Evidencia fotográfica de campaña" : "Guía de registro fotográfico", PAGE.margin, 98, { width: 760 });
  doc.font("Helvetica").fontSize(14).fillColor(mutedColor)
    .text(dark ? "Registro visual del soporte en campaña." : "Resumen visual de la evidencia enviada.", PAGE.margin, 138, { width: 760 });

  const photoX = PAGE.margin;
  const photoY = 190;
  const photoW = 900;
  const photoH = PAGE.height - photoY - PAGE.margin - 50;
  const buffer = await imageBuffer(foto.url);
  drawImageCover(doc, buffer, photoX, photoY, photoW, photoH, 22);
  doc.roundedRect(photoX, photoY, photoW, photoH, 22).lineWidth(1).strokeColor(dark ? COLORS.line : COLORS.lineLight).stroke();

  const cardX = photoX + photoW + 40;
  const cardW = PAGE.width - PAGE.margin - cardX;
  const cardH = 250;
  doc.roundedRect(cardX, photoY, cardW, cardH, 18).fill(COLORS.card);
  doc.font("Helvetica-Bold").fontSize(11.5).fillColor(COLORS.accent2).text("REPORTE FOTOGRÁFICO", cardX + 26, photoY + 28, { characterSpacing: 1.5 });
  doc.font("Helvetica-Bold").fontSize(18).fillColor(COLORS.white).text("Evidencia de campaña", cardX + 26, photoY + 54, { width: cardW - 52 });
  doc.font("Helvetica").fontSize(12.5).fillColor(COLORS.muted)
    .text("Evidencia clara del soporte instalado.", cardX + 26, photoY + 88, { width: cardW - 52 });
  doc.moveTo(cardX + 26, photoY + 146).lineTo(cardX + cardW - 26, photoY + 146).lineWidth(1).strokeColor(COLORS.line).stroke();
  doc.font("Helvetica-Bold").fontSize(11.5).fillColor(COLORS.accent2).text("FECHA DE REGISTRO", cardX + 26, photoY + 166, { characterSpacing: 1.5 });
  doc.font("Helvetica-Bold").fontSize(16).fillColor(COLORS.white).text(fechaCorta(foto.fecha), cardX + 26, photoY + 188);

  drawFooter(doc, pad2(pageNum), dark);
}

function cierre(doc: PDFKit.PDFDocument, totalPages: number) {
  if (existsSync(CIERRE_BG)) {
    drawImageCover(doc, CIERRE_BG, 0, 0, PAGE.width, PAGE.height, 0);
    const overlay = doc.linearGradient(0, PAGE.height * 0.3, 0, PAGE.height);
    overlay.stop(0, "#000000", 0).stop(1, "#000000", 0.72);
    doc.rect(0, 0, PAGE.width, PAGE.height).fill(overlay as never);
  } else {
    doc.rect(0, 0, PAGE.width, PAGE.height).fill(COLORS.bg);
    drawRings(doc, PAGE.width / 2, PAGE.height * 0.36, 320);
  }

  const logoW = 320;
  doc.image(LOGO_WORDMARK_WHITE, (PAGE.width - logoW) / 2, PAGE.height * 0.44, { width: logoW });
  doc.font("Helvetica-Bold").fontSize(28).fillColor(COLORS.white)
    .text("Publicidad exterior premium", 0, PAGE.height * 0.44 + 86, { align: "center", width: PAGE.width });
  doc.font("Helvetica").fontSize(14).fillColor(COLORS.muted)
    .text("Presencia visual, evidencia clara y marca visible.", 0, PAGE.height * 0.44 + 126, { align: "center", width: PAGE.width });

  doc.font("Helvetica").fontSize(10.5).fillColor(COLORS.muted)
    .text("VISTA360 · REPORTE FOTOGRÁFICO", PAGE.margin, PAGE.height - 40, { characterSpacing: 1 });
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
    await paginaEvidencia(doc, fotosFlat[i], { dark, pageNum });
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

async function comprimirConGhostscript(input: Buffer, dpi: 72 | 150) {
  const dir = await mkdtemp(join(tmpdir(), "vista360-report-"));
  const source = join(dir, "source.pdf");
  const output = join(dir, `out-${dpi}.pdf`);
  await writeFile(source, input);
  try {
    await execFileAsync(process.env.GS_BINARY ?? "gs", [
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      "-dNOPAUSE",
      "-dQUIET",
      "-dBATCH",
      "-dDetectDuplicateImages=true",
      "-dDownsampleColorImages=true",
      "-dDownsampleGrayImages=true",
      "-dDownsampleMonoImages=true",
      `-dColorImageResolution=${dpi}`,
      `-dGrayImageResolution=${dpi}`,
      `-dMonoImageResolution=${dpi}`,
      "-sOutputFile=" + output,
      source,
    ]);
    return await readFile(output);
  } catch (error) {
    // Firebase Functions no incluye Ghostscript de forma estándar. La
    // compresión es una optimización, no debe impedir que el reporte se
    // genere. En ese entorno publicamos el PDF original de PDFKit.
    console.warn(`Ghostscript no disponible para ${dpi} DPI; se usará el PDF original.`, error);
    return input;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
      };

      const reporte = await generarReporte(cliente, elementos);
      const [digital, hd] = await Promise.all([
        comprimirConGhostscript(reporte.buffer, 72),
        comprimirConGhostscript(reporte.buffer, 150),
      ]);

      const baseKey = `clientes/${clienteId}/reportes/${mes}`;
      const [urlDigital, urlHd] = await Promise.all([
        subirReporteR2(`${baseKey}/reporte-digital.pdf`, digital),
        subirReporteR2(`${baseKey}/reporte-hd.pdf`, hd),
      ]);

      await db.collection("informesCliente").doc(`${clienteId}_${mes}`).set(
        {
          cliente_id: clienteId,
          mes,
          mesLabel: cliente.periodo,
          url: urlDigital,
          urlDigital,
          urlHd,
          storage: "r2",
          r2Keys: {
            digital: `${baseKey}/reporte-digital.pdf`,
            hd: `${baseKey}/reporte-hd.pdf`,
          },
          digitalBytes: digital.length,
          hdBytes: hd.length,
          numCampanas: reporte.numElementos,
          numEvidencias: reporte.numEvidencias,
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        ok: true,
        urlDigital,
        urlHd,
        digitalBytes: digital.length,
        hdBytes: hd.length,
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error("Error inesperado al generar el reporte.", error);
      const detail = error instanceof Error ? error.message : "Error desconocido";
      throw new HttpsError("internal", `No se pudo generar el PDF: ${detail}`);
    }
  }
);
