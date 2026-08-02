import { jsPDF } from "jspdf";
import type { Cotizacion } from "../types";
import { dinero, esCotizacionExonerada, fechaVisible } from "./cotizaciones";

// Paleta calcada de .quote-document en app.css, para que el PDF se
// vea igual que la vista previa en pantalla.
const NAVY = "#071322";
const TEXT = "#172235";
const GRAY_LABEL = "#5d6878";
const GRAY_MUTED = "#657083";
const GRAY_COPY = "#344054";
const BORDER = "#d4d9e0";
const ROW_BG = "#f1f3f6";
const COPY_BG = "#f6f7f9";

const PAGE_W = 210; // A4 mm
const MARGIN = 20;
const CONTENT_W = PAGE_W - MARGIN * 2;

let logoDataUrlCache: string | null | undefined;

// El logo pesa ~3KB -- se guarda en cache para no volver a pedirlo
// cada vez que se abre la vista previa de una cotización.
async function cargarLogo(): Promise<string | null> {
  if (logoDataUrlCache !== undefined) return logoDataUrlCache;
  try {
    const respuesta = await fetch("/vista360-logo-cotizacion.png");
    const blob = await respuesta.blob();
    logoDataUrlCache = await new Promise<string>((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(String(lector.result));
      lector.onerror = () => reject(lector.error);
      lector.readAsDataURL(blob);
    });
  } catch {
    logoDataUrlCache = null;
  }
  return logoDataUrlCache;
}

function partirTexto(doc: jsPDF, texto: string, ancho: number): string[] {
  return doc.splitTextToSize(texto, ancho) as string[];
}

/** Arma el PDF de una cotización enteramente en el navegador -- sin
 *  pasar por ningún Cloud Function ni R2. Como es puro texto (más un
 *  logo de 3KB), el archivo final pesa unos pocos KB, bien liviano
 *  para mandar por WhatsApp o correo. */
export async function generarCotizacionPdf(cotizacion: Cotizacion): Promise<File> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  let y = 24;

  const logo = await cargarLogo();
  if (logo) {
    // Proporción real del PNG (940x103) para no deformarlo.
    const alto = 8;
    const ancho = alto * (940 / 103);
    doc.addImage(logo, "PNG", MARGIN, y - 6, ancho, alto);
  }
  doc.setFont("times", "bold");
  doc.setFontSize(10);
  doc.setTextColor(TEXT);
  doc.text("ALAN MARTÍNEZ", PAGE_W - MARGIN, y - 2, { align: "right" });
  y += 14;

  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 12;

  doc.setFont("times", "normal");
  doc.setFontSize(9);
  doc.setTextColor(GRAY_MUTED);
  doc.text(`COTIZACIÓN COMERCIAL · ${cotizacion.numero}`, MARGIN, y);
  y += 9;

  doc.setFont("times", "bold");
  doc.setFontSize(22);
  doc.setTextColor(TEXT);
  const tituloLineas = partirTexto(doc, cotizacion.nombre || "Propuesta comercial", CONTENT_W);
  doc.text(tituloLineas, MARGIN, y);
  y += tituloLineas.length * 8.5 + 2;

  doc.setFont("times", "normal");
  doc.setFontSize(11);
  doc.setTextColor(GRAY_MUTED);
  doc.text("Una campaña diseñada para generar presencia, alcance y resultados.", MARGIN, y);
  y += 12;

  // Tabla de detalle -- misma info que la vista previa: cliente,
  // panel, ubicación, periodo, duración, inversión.
  const filas: Array<[string, string]> = [
    ["CLIENTE", cotizacion.clienteNombre],
    ["PANEL", cotizacion.panelNombre],
    ["UBICACIÓN", cotizacion.panelCiudad || "Ubicación seleccionada"],
    ["PERIODO", `${fechaVisible(cotizacion.inicio)} al ${fechaVisible(cotizacion.fin)}`],
    ["DURACIÓN", `${cotizacion.duracionMeses} ${cotizacion.duracionMeses === 1 ? "mes" : "meses"}`],
  ];
  const colLabelW = CONTENT_W * 0.31;
  const filaAltoBase = 11;

  doc.setDrawColor(BORDER);
  doc.setLineWidth(0.25);
  const tablaInicioY = y;

  // Encabezado de la tabla (fondo navy).
  doc.setFillColor(NAVY);
  doc.rect(MARGIN, y, CONTENT_W, 10, "F");
  doc.setFont("times", "bold");
  doc.setFontSize(10);
  doc.setTextColor("#ffffff");
  doc.text("DETALLE DE LA PROPUESTA", MARGIN + 4, y + 6.8);
  if (cotizacion.estado !== "Borrador") {
    doc.setFontSize(7.5);
    doc.text(cotizacion.estado.toUpperCase(), PAGE_W - MARGIN - 4, y + 6.5, { align: "right" });
  }
  y += 10;

  for (const [label, valor] of filas) {
    const valorLineas = partirTexto(doc, valor, CONTENT_W - colLabelW - 8);
    const filaAlto = Math.max(filaAltoBase, valorLineas.length * 5 + 6);
    doc.setFillColor(ROW_BG);
    doc.rect(MARGIN, y, colLabelW, filaAlto, "F");
    doc.setFont("times", "bold");
    doc.setFontSize(8);
    doc.setTextColor(GRAY_LABEL);
    doc.text(label, MARGIN + 4, y + filaAlto / 2 + 1.2);
    doc.setFont("times", "normal");
    doc.setFontSize(10);
    doc.setTextColor(TEXT);
    doc.text(valorLineas, MARGIN + colLabelW + 4, y + filaAlto / 2 - (valorLineas.length - 1) * 2 + 1.2);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += filaAlto;
  }

  // Fila de inversión, resaltada.
  const montoTexto = dinero(cotizacion.monto, cotizacion.moneda);
  const sinIgv = !esCotizacionExonerada(cotizacion);
  const filaInvAlto = 14;
  doc.setFillColor(ROW_BG);
  doc.rect(MARGIN, y, colLabelW, filaInvAlto, "F");
  doc.setFont("times", "bold");
  doc.setFontSize(8);
  doc.setTextColor(GRAY_LABEL);
  doc.text("INVERSIÓN", MARGIN + 4, y + filaInvAlto / 2 + 1.2);
  doc.setFont("times", "bold");
  doc.setFontSize(13);
  doc.setTextColor(TEXT);
  doc.text(montoTexto, MARGIN + colLabelW + 4, y + filaInvAlto / 2 - (sinIgv ? 1.5 : 0.5));
  if (sinIgv) {
    doc.setFont("times", "normal");
    doc.setFontSize(8);
    doc.setTextColor(GRAY_MUTED);
    doc.text(cotizacion.incluyeIgv ? "Incluye IGV" : "No incluye IGV", MARGIN + colLabelW + 4, y + filaInvAlto / 2 + 4.5);
  }
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += filaInvAlto;

  doc.setDrawColor(BORDER);
  doc.rect(MARGIN, tablaInicioY, CONTENT_W, y - tablaInicioY, "S");
  y += 10;

  // Bloques de texto (importante / condiciones / observaciones), con
  // el mismo tratamiento visual (fondo gris claro, borde).
  function bloqueTexto(titulo: string, texto: string) {
    const lineas = partirTexto(doc, texto, CONTENT_W - 12);
    const alto = lineas.length * 4.6 + 12;
    if (y + alto > 275) {
      doc.addPage();
      y = 24;
    }
    doc.setFillColor(COPY_BG);
    doc.setDrawColor(BORDER);
    doc.rect(MARGIN, y, CONTENT_W, alto, "FD");
    doc.setFont("times", "bold");
    doc.setFontSize(8);
    doc.setTextColor(GRAY_MUTED);
    doc.text(titulo.toUpperCase(), MARGIN + 6, y + 7);
    doc.setFont("times", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(GRAY_COPY);
    doc.text(lineas, MARGIN + 6, y + 12.5);
    y += alto + 6;
  }

  bloqueTexto("Importante", `Esta cotización tiene una vigencia de ${cotizacion.vigenciaDias} días desde su emisión. Cualquier consulta, escríbenos al 947 957 971.`);
  if (cotizacion.condiciones) bloqueTexto("Condiciones de pago", cotizacion.condiciones);
  if (cotizacion.observaciones) bloqueTexto("Consideraciones", cotizacion.observaciones);

  // Footer -- siempre al pie de la última página usada.
  const footerY = 282;
  doc.setDrawColor(BORDER);
  doc.setFont("times", "bold");
  doc.setFontSize(9);
  doc.setTextColor(TEXT);
  doc.text("947 957 971 · ochomillas.101@hotmail.com", MARGIN, footerY);
  doc.setFont("times", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(GRAY_MUTED);
  doc.text("PUBLICIDAD EXTERIOR · PANELES PREMIUM", MARGIN, footerY + 4.5);

  const tagAncho = 62;
  doc.setFillColor(NAVY);
  doc.rect(PAGE_W - MARGIN - tagAncho, footerY - 5, tagAncho, 9.5, "F");
  doc.setFont("times", "bold");
  doc.setFontSize(8);
  doc.setTextColor("#ffffff");
  doc.text("MÁS QUE VISIBILIDAD. PRESENCIA.", PAGE_W - MARGIN - tagAncho / 2, footerY + 0.8, { align: "center" });

  const bytes = doc.output("arraybuffer");
  return new File([bytes], nombreArchivoCotizacion(cotizacion), { type: "application/pdf" });
}

export function nombreArchivoCotizacion(cotizacion: Cotizacion): string {
  const base = (cotizacion.numero || cotizacion.nombre || "cotizacion").replace(/[^a-zA-Z0-9-]+/g, "-");
  return `Cotizacion-${base}.pdf`;
}
