import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import PDFDocument from "pdfkit";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

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

const PAGE = {
  width: 1080,
  height: 1350,
  margin: 64,
  bg: "#07111f",
  panel: "#0d1b2e",
  card: "#111f33",
  accent: "#38bdf8",
  accent2: "#22c55e",
  text: "#f8fafc",
  muted: "#94a3b8",
};

const CONTENT_X = PAGE.margin + 42;
const CONTENT_W = 570;
const SIDE_W = 236;
const SIDE_X = PAGE.width - PAGE.margin - SIDE_W - 20;

const REPORT_SECRETS = ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new HttpsError("failed-precondition", `Falta configurar ${name}.`);
  }
  return value;
}

function normalizeFoto(foto: FotoInput) {
  return typeof foto === "string" ? { url: foto } : foto;
}

function nombreMes(mes: string) {
  const [year, month] = mes.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric" }).format(date);
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

function drawBackground(doc: PDFKit.PDFDocument) {
  doc.rect(0, 0, PAGE.width, PAGE.height).fill(PAGE.bg);
  doc
    .roundedRect(PAGE.margin, PAGE.margin, PAGE.width - PAGE.margin * 2, PAGE.height - PAGE.margin * 2, 32)
    .fill(PAGE.panel);
}

function drawLateralCard(doc: PDFKit.PDFDocument, cliente: ClienteReporte) {
  const x = SIDE_X;
  doc.roundedRect(x, 120, SIDE_W, 310, 24).fill(PAGE.card);
  doc.fillColor(PAGE.accent).fontSize(18).text("CLIENTE", x + 28, 156);
  doc.fillColor(PAGE.text).fontSize(25).text(cliente.nombre, x + 28, 190, { width: 180 });
  doc.fillColor(PAGE.muted).fontSize(16).text(cliente.periodo, x + 28, 286, { width: 180 });
  doc.moveTo(x + 28, 335).lineTo(x + 208, 335).strokeColor("#20344f").lineWidth(2).stroke();
  doc.fillColor(PAGE.muted).fontSize(14).text("LUGAR", x + 28, 360);
  doc.fillColor(PAGE.text).fontSize(17).text(cliente.ubicacion, x + 28, 384, { width: 180 });
}

function drawHeader(doc: PDFKit.PDFDocument, title: string, cliente: ClienteReporte) {
  drawBackground(doc);
  doc.fillColor(PAGE.accent).fontSize(20).text("VISTA360", PAGE.margin + 42, 118);
  doc.fillColor(PAGE.text).fontSize(42).text(title, PAGE.margin + 42, 162, { width: 620 });
  doc.fillColor(PAGE.muted).fontSize(18).text(cliente.periodo, PAGE.margin + 42, 222);
  drawLateralCard(doc, cliente);
}

function portada(doc: PDFKit.PDFDocument, cliente: ClienteReporte) {
  drawBackground(doc);
  doc.fillColor(PAGE.accent).fontSize(24).text("VISTA360", PAGE.margin + 70, 190);
  doc.fillColor(PAGE.text).fontSize(76).text("Reporte mensual", PAGE.margin + 70, 270, { width: 720 });
  doc.fillColor(PAGE.muted).fontSize(28).text(cliente.periodo, PAGE.margin + 72, 470);
  doc.roundedRect(PAGE.margin + 70, 600, 650, 190, 28).fill(PAGE.card);
  doc.fillColor(PAGE.muted).fontSize(18).text("CLIENTE", PAGE.margin + 110, 640);
  doc.fillColor(PAGE.text).fontSize(36).text(cliente.nombre, PAGE.margin + 110, 675, { width: 560 });
  doc.fillColor(PAGE.muted).fontSize(18).text(cliente.ubicacion, PAGE.margin + 110, 748, { width: 560 });
  doc.circle(PAGE.width - 220, PAGE.height - 210, 88).fill(PAGE.accent);
  doc.circle(PAGE.width - 220, PAGE.height - 210, 54).fill(PAGE.bg);
  doc.fillColor(PAGE.text).fontSize(18).text("Reporte digital", PAGE.width - 330, PAGE.height - 92, { width: 220, align: "center" });
}

function cierre(doc: PDFKit.PDFDocument, cliente: ClienteReporte) {
  drawBackground(doc);
  doc.fillColor(PAGE.text).fontSize(54).text("Gracias", PAGE.margin + 70, 310);
  doc.fillColor(PAGE.muted).fontSize(25).text("Tu campaña sigue visible y monitoreada por Vista360.", PAGE.margin + 70, 394, { width: 650 });
  doc.roundedRect(PAGE.margin + 70, 560, 650, 210, 28).fill(PAGE.card);
  doc.fillColor(PAGE.accent2).fontSize(18).text("REPORTE GENERADO", PAGE.margin + 110, 606);
  doc.fillColor(PAGE.text).fontSize(30).text(cliente.nombre, PAGE.margin + 110, 644, { width: 560 });
  doc.fillColor(PAGE.muted).fontSize(20).text(cliente.periodo, PAGE.margin + 110, 698);
}

async function paginaUnaFoto(doc: PDFKit.PDFDocument, cliente: ClienteReporte, elemento: ReporteElemento) {
  drawHeader(doc, elemento.titulo, { ...cliente, ubicacion: elemento.ubicacion || cliente.ubicacion });
  const foto = normalizeFoto(elemento.fotos[0]);
  const buffer = await imageBuffer(foto.url);
  doc.roundedRect(CONTENT_X, 330, CONTENT_W, 820, 30).fill(PAGE.card);
  doc.image(buffer, CONTENT_X + 26, 356, { fit: [CONTENT_W - 52, 768], align: "center", valign: "center" });
  if (foto.fecha) {
    doc.fillColor(PAGE.muted).fontSize(16).text(`Fecha: ${foto.fecha}`, CONTENT_X + 26, 1168);
  }
}

async function paginaDosFotos(doc: PDFKit.PDFDocument, cliente: ClienteReporte, elemento: ReporteElemento) {
  drawHeader(doc, elemento.titulo, { ...cliente, ubicacion: elemento.ubicacion || cliente.ubicacion });
  const fotos = elemento.fotos.slice(0, 2).map(normalizeFoto);
  const [first, second] = await Promise.all(fotos.map((foto) => imageBuffer(foto.url)));
  doc.roundedRect(CONTENT_X, 330, CONTENT_W, 382, 28).fill(PAGE.card);
  doc.image(first, CONTENT_X + 24, 354, { fit: [CONTENT_W - 48, 334], align: "center", valign: "center" });
  doc.roundedRect(CONTENT_X, 752, CONTENT_W, 382, 28).fill(PAGE.card);
  doc.image(second, CONTENT_X + 24, 776, { fit: [CONTENT_W - 48, 334], align: "center", valign: "center" });
}

export async function generarReporte(cliente: ClienteReporte, elementos: ReporteElemento[]): Promise<ReportePdf> {
  const doc = new PDFDocument({ size: [PAGE.width, PAGE.height], margin: 0, autoFirstPage: false });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  doc.addPage();
  portada(doc, cliente);

  for (const elemento of elementos) {
    const fotos = elemento.fotos.filter(Boolean).slice(0, 2);
    if (fotos.length === 0) continue;
    doc.addPage();
    if (fotos.length === 1) {
      await paginaUnaFoto(doc, cliente, { ...elemento, fotos });
    } else {
      await paginaDosFotos(doc, cliente, { ...elemento, fotos });
    }
  }

  doc.addPage();
  cierre(doc, cliente);
  doc.end();

  await new Promise<void>((resolve, reject) => {
    doc.on("end", resolve);
    doc.on("error", reject);
  });

  return {
    buffer: Buffer.concat(chunks),
    numEvidencias: elementos.reduce((sum, item) => sum + Math.min(item.fotos.length, 2), 0),
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

function r2Client() {
  const accountId = requireEnv("R2_ACCOUNT_ID");
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

async function subirReporteR2(key: string, buffer: Buffer) {
  const bucket = requireEnv("R2_BUCKET");
  await r2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: "application/pdf",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
  const publicBase = requireEnv("R2_PUBLIC_BASE_URL").replace(/\/$/, "");
  return `${publicBase}/${key}`;
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
  const elementos: ReporteElemento[] = [];
  for (let i = 0; i < fotos.length; i += 2) {
    elementos.push({
      titulo: "Evidencia de campaña",
      ubicacion,
      fotos: fotos.slice(i, i + 2),
    });
  }
  return elementos;
}

export const generarReporteCliente = onCall(
  { timeoutSeconds: 540, memory: "1GiB", secrets: REPORT_SECRETS },
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
      const elementos = elementosSubidos.length > 0 ? elementosSubidos : await cargarElementos(clienteId, mes);
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
