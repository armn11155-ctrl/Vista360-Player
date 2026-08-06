import { dirname, join } from "node:path";
import { enviarPushACliente } from "./notificacionesPush.js";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { R2_SECRETS, borrarObjetoR2, firmarLecturaR2, leerObjetoR2, subirBufferR2 } from "./r2Storage.js";
import { esPersonalInterno } from "./rolesInternos.js";
import { exigirId, idOpcional } from "./identificadores.js";

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
const LOGO_PLAYER_WHITE = join(ASSETS_DIR, "logos/vista360-player-white.png");
const LOGO_PLAYER_BLACK = join(ASSETS_DIR, "logos/vista360-player-black.png");
// Version del logo con "PLAYER" (y las lineas) en blanco en vez de
// azul -- se usa SOLO en paginaPanel(), donde se pidio el logo
// totalmente blanco (sin nada de azul).
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

/** Las claves de R2 del proyecto siempre empiezan así, y nunca son URLs. */
function esClaveR2(valor: string) {
  return valor.startsWith("vista360/") && !valor.startsWith("http");
}

async function imageBuffer(url: string) {
  if (url.startsWith("data:image/")) {
    const base64 = url.split(",")[1];
    if (!base64) throw new Error("Imagen inválida.");
    return Buffer.from(base64, "base64");
  }
  // Clave de R2: es el camino nuevo. Las fotos del reporte se suben a R2
  // desde el navegador y acá solo llega la clave, así la llamada pesa unos
  // pocos KB en vez de arrastrar las imágenes enteras -- que era lo que
  // topaba con el límite de 10 MB de Cloud Functions.
  // Se sigue aceptando data:image/ para no romper nada que aún lo mande.
  if (esClaveR2(url)) {
    return leerObjetoR2(url);
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
 *  del piso real para no arriesgar en fotos con mas ruido de camara.
 *
 *  Se pidio mejorar la calidad de la foto sin disparar el peso -- y
 *  despues, la version MAS liviana que se pueda sin perder esa mejora.
 *  Se probo subir la resolucion (maxWidth) ademas de la calidad, pero
 *  eso es lo que MAS pesa (una foto de prueba con texto/graficos de
 *  color, representativa de un panel real, paso de 40KB a 88-115KB al
 *  subir resolucion Y calidad juntas -- +117% a +182%). No se toco mas
 *  la resolucion despues de esto.
 *
 *  Apagar el submuestreo de color (chromaSubsampling "4:2:0" ->
 *  "4:4:4") evita un halo de color en los bordes de las letras. Se
 *  probo despues bajar mas la calidad (30, con "4:2:0" de nuevo) para
 *  aligerar mas el peso -- en recortes de cerca de 2 fotos reales de
 *  prueba se veia bien, pero el cliente lo probo en el reporte real
 *  (PDF completo, no un recorte ampliado) y SI se notaba perdida de
 *  calidad ahi. Se volvio a 45 + "4:4:4", que es la que el cliente ya
 *  habia visto y aprobado antes.
 *
 *  Ultima ronda: se probo JPEG progresivo (sin ninguna diferencia de
 *  peso, descartado) y un afilado suave (sharpen) ANTES de comprimir
 *  -- el resize/compresion ablandan un poco los bordes, y afilarlos
 *  de vuelta permite bajar la calidad numerica sin que se note tanto
 *  la perdida. Con sharpen + calidad 35 (en vez de 45), en las 2
 *  fotos reales de prueba: 47.7KB -> 44.0KB y 147.0KB -> 138.9KB
 *  (-6% a -8%), sin perdida visible en los mismos 3 recortes de cerca
 *  ya probados antes (texto del cartel, cielo degradado, textura de
 *  ventana).
 */
const FOTO_CONFIG = { maxWidth: 1200, quality: 35 };

async function comprimirFoto(buffer: Buffer) {
  try {
    return await sharp(buffer)
      .rotate()
      .resize({ width: FOTO_CONFIG.maxWidth, withoutEnlargement: true })
      // Afilado suave (ver comentario de FOTO_CONFIG arriba) --
      // contrarresta el ablandado del resize/compresion, para poder
      // bajar la calidad numerica sin que se note tanto.
      .sharpen({ sigma: 0.6 })
      .jpeg({
        quality: FOTO_CONFIG.quality,
        mozjpeg: true,
        chromaSubsampling: "4:4:4",
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

function drawKicker(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  color = COLORS.accent,
  size = 14,
  options: { center?: boolean } = {}
) {
  const upper = sinTildes(text.toUpperCase());
  doc.font("Helvetica-Bold").fontSize(size).fillColor(color);
  const w = doc.widthOfString(upper, { characterSpacing: 2 });
  // Centrado: x pasa a ser el CENTRO horizontal deseado (no el borde
  // izquierdo) -- se usa en la portada, donde se pidió centrar el
  // kicker y el título en vez de pegarlos al margen izquierdo.
  const drawX = options.center ? x - w / 2 : x;
  doc.text(upper, drawX, y, { characterSpacing: 2 });
  const lineY = y + size + 8;
  const lineW = Math.min(w, 96);
  const lineX = options.center ? x - lineW / 2 : drawX;
  doc.moveTo(lineX, lineY).lineTo(lineX + lineW, lineY).lineWidth(2).strokeColor(color).stroke();
}

/** Icono de pin de ubicacion (calcado del feather-icons "map-pin"),
 *  para la tarjeta de ubicacion de la portada -- se pidio que se vea
 *  igual a la referencia enviada (con su icono al lado del texto). */
function drawPinIcon(doc: PDFKit.PDFDocument, x: number, y: number, size: number, color: string) {
  doc.save();
  doc.translate(x, y).scale(size / 24);
  doc.path("M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z")
    .lineWidth(1.8).strokeColor(color).lineJoin("round").lineCap("round").stroke();
  doc.circle(12, 10, 3).lineWidth(1.8).strokeColor(color).stroke();
  doc.restore();
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

/** Pie de pagina de barra: barra oscura (103px por defecto) con una
 *  linea de acento configurable de 5px justo encima, a todo el ancho.
 *  Color y grosor de esa linea son parametros (stripColor/stripHeight)
 *  -- en las paginas de evidencia (fondo blanco) es el azul de acento
 *  de siempre; en la divisoria de panel (fondo oscuro) es un
 *  degradado (ver stripGradient) en vez de un color solido. La barra
 *  oscura de abajo NO cambia de color en ningun caso -- se pidio que
 *  esa se quede siempre negra.
 *
 *  stripGradient (opcional): lista de colores para pintar la linea
 *  como un degradado horizontal en vez de solida -- se pidio para la
 *  divisoria de panel un azul que "empieza oscuro, se aclara al medio
 *  y vuelve oscuro", como un brillo metalico elegante. Si se pasa,
 *  tiene prioridad sobre stripColor.
 *
 *  barH (opcional): alto de la barra -- se pidio una version mas
 *  delgada para las paginas de evidencia (deja mas espacio para la
 *  foto), sin tocar la de paginaPanel que se queda con el alto
 *  original. */
function drawFooterBar(
  doc: PDFKit.PDFDocument,
  num: string,
  stripColor = COLORS.accent,
  stripHeight = 5,
  stripGradient?: string[],
  barH = 103
) {
  const barY = PAGE.height - barH;
  if (stripGradient && stripGradient.length > 1) {
    const gradient = doc.linearGradient(0, 0, PAGE.width, 0);
    stripGradient.forEach((color, i) => {
      gradient.stop(i / (stripGradient.length - 1), color);
    });
    doc.rect(0, barY - stripHeight, PAGE.width, stripHeight).fill(gradient);
  } else {
    doc.rect(0, barY - stripHeight, PAGE.width, stripHeight).fill(stripColor);
  }
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
  // Se cambio el anillo decorativo por un brillo suave arriba a la
  // derecha -- mismo tratamiento elegante que el fondo de cierre()
  // (degradado radial oscuro y sutil), en vez del grafico de anillo,
  // que se pidio quitar para que ambas paginas tengan el mismo nivel
  // de elegancia.
  // OJO: el primer intento de tener los dos brillos partia la pagina
  // a la mitad (uno arriba, otro abajo) para que el segundo .fill()
  // no tapara al primero -- pero eso dejaba una linea recta visible
  // justo en el corte (un degradado que se interrumpe de golpe no es
  // un degradado). El fix real: la ultima parada de cada gradiente
  // ahora es TRANSPARENTE (opacity 0, tercer parametro de .stop())
  // en vez de solida -- asi el area lejos del centro no tapa nada de
  // lo que haya debajo, y los dos brillos se pueden pintar sobre la
  // pagina COMPLETA sin que ninguno borre al otro.
  const glowX = PAGE.width * 0.92;
  const glowY = -60;
  const glow = doc.radialGradient(glowX, glowY, 0, glowX, glowY, 750);
  glow.stop(0, "#17335c");
  glow.stop(0.45, "#0e1830");
  glow.stop(1, COLORS.bg, 0);
  doc.rect(0, 0, PAGE.width, PAGE.height).fill(glow);

  // Mismo brillo, espejado: abajo a la izquierda -- se pidio el
  // mismo tratamiento tambien en esa esquina de la portada, para que
  // queden los dos (arriba-derecha y abajo-izquierda).
  const glow2X = PAGE.width * 0.08;
  const glow2Y = PAGE.height + 60;
  const glow2 = doc.radialGradient(glow2X, glow2Y, 0, glow2X, glow2Y, 750);
  glow2.stop(0, "#17335c");
  glow2.stop(0.45, "#0e1830");
  glow2.stop(1, COLORS.bg, 0);
  doc.rect(0, 0, PAGE.width, PAGE.height).fill(glow2);

  // Logo, kicker y titulo agrandados y reacomodados para un look mas
  // premium -- se pidio libertad total en tamano/posicion, mientras
  // se sienta elegante. Todo sigue centrado horizontalmente.
  // El logo estaba a solo 68px del borde superior, mientras que el
  // espacio entre el logo y el kicker de abajo era de ~107px -- se
  // notaba desequilibrado (muy pegado arriba). Se baja el bloque
  // completo 40px (mismo espaciado interno entre logo/kicker/titulo,
  // nada mas se mueve el conjunto) para que el margen de arriba se
  // sienta mas parecido al de abajo.
  const centroX = PAGE.width / 2;
  const logoW = 540;
  doc.image(LOGO_WORDMARK_WHITE, centroX - logoW / 2, 108, { width: logoW });

  // Se pidio subir este bloque (kicker + "REPORTE FOTOGRAFICO") un poco
  // -- quedaba mucho mas espacio vacio arriba (entre el logo y este
  // bloque) que abajo (entre "FOTOGRAFICO" y la fila de tarjetas). Se
  // sube el bloque completo 40pt (mismo espaciado interno entre
  // kicker/REPORTE/FOTOGRAFICO, nada mas se mueve el conjunto), el
  // logo se queda donde estaba.
  const ciudad = sinTildes(cliente.ciudad || "Peru");
  drawKicker(doc, `Reporte mensual / ${ciudad}`, centroX, 232, COLORS.accent, 23, { center: true });

  doc.font("Helvetica-Bold").fontSize(104).fillColor(COLORS.white);
  const wReporte = doc.widthOfString("REPORTE", { characterSpacing: 0.5 });
  const wFotografico = doc.widthOfString("FOTOGRAFICO", { characterSpacing: 0.5 });
  doc.text("REPORTE", centroX - wReporte / 2, 298, { characterSpacing: 0.5 });
  doc.text("FOTOGRAFICO", centroX - wFotografico / 2, 418, { characterSpacing: 0.5 });

  // Tarjetas mas compactas (menos espacio vacio que el primer calco de
  // la referencia — el hueco se notaba mucho con textos cortos reales).
  const cardY = 626;
  const cardH = 108;

  // Tarjeta blanca: Cliente / Periodo
  const cardX1 = 74;
  const cardW1 = 865;
  // Misma sombra "3D" que la tarjeta de ubicacion, para que las dos
  // se vean con el mismo nivel de elevacion/profundidad.
  doc.save();
  doc.opacity(0.3);
  doc.roundedRect(cardX1 - 6, cardY + 14, cardW1 + 12, cardH + 10, 24).fill("#000000");
  doc.opacity(0.18);
  doc.roundedRect(cardX1 - 12, cardY + 22, cardW1 + 24, cardH + 18, 28).fill("#000000");
  doc.restore();
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
  // El icono de pin ahora es grande y va a la izquierda del todo (como
  // en la referencia), asi que el texto arranca mas a la derecha
  // (textX) en vez de pegado al borde.
  const textX = 78;
  const innerW2 = cardW2 - textX - 30;
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

  // Sombra tipo "3D": un par de capas oscuras semitransparentes,
  // corridas hacia abajo y un poco mas grandes que la tarjeta, para
  // simular un blur suave -- asi la tarjeta se ve elevada/flotando
  // sobre el fondo, como se pidio ("que se sobresalga").
  doc.save();
  doc.opacity(0.3);
  doc.roundedRect(cardX2 - 6, cardY + 14, cardW2 + 12, cardH2 + 10, 24).fill("#000000");
  doc.opacity(0.18);
  doc.roundedRect(cardX2 - 12, cardY + 22, cardW2 + 24, cardH2 + 18, 28).fill("#000000");
  doc.restore();

  // Colores calcados de la foto de referencia (medidos pixel por pixel):
  // el interior de la tarjeta es un azul-negro muy oscuro y poco
  // saturado (~rgb(18,21,30)), bastante mas oscuro que el azul marino
  // que se usaba antes (#182a46 era demasiado claro/saturado).
  doc.save();
  doc.roundedRect(cardX2, cardY, cardW2, cardH2, 18).clip();
  doc.rect(cardX2, cardY, cardW2, cardH2).fill("#12151e");
  // Filo superior sutil -- un hilo de luz fino (1.5px, semi
  // transparente), no una barra de acento solida y gruesa.
  doc.opacity(0.55);
  doc.rect(cardX2, cardY, cardW2, 1.5).fill(COLORS.accent);
  doc.restore();
  // Borde un poco mas claro que el fondo/tarjeta, para que se note
  // el contorno (antes casi se perdia por ser tan parecido al fondo).
  doc.roundedRect(cardX2, cardY, cardW2, cardH2, 18).lineWidth(1.3).strokeColor("#333c54").stroke();
  // Icono de pin grande, color gris (no azul), centrado verticalmente
  // en la tarjeta, a la izquierda -- igual a la referencia enviada.
  const pinSize = 34;
  drawPinIcon(doc, cardX2 + 26, cardY + (cardH2 - pinSize) / 2, pinSize, COLORS.muted);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.accent)
    .text(cliente.esMultiPanel ? "PANELES" : "UBICACION", cardX2 + textX, cardY + 22, { characterSpacing: 1.5 });
  doc.font("Helvetica-Bold").fontSize(lugarSize).fillColor(COLORS.white).text(lugar, cardX2 + textX, cardY + lugarY, { width: innerW2 });
  if (resto) {
    doc.font("Helvetica").fontSize(restoSize).fillColor(COLORS.muted).text(resto, cardX2 + textX, cardY + restoY, { width: innerW2 });
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
  // Mismo brillo de la version oscura (ver paginaEvidenciaOscura),
  // adaptado a fondo blanco: un lavado azul MUY suave (opacity baja)
  // en vez del degradado oscuro -- un glow tan marcado como el de la
  // portada se veria mal sobre blanco, esto es la version "premium
  // discreta" para que la pagina blanca tambien tenga el mismo
  // detalle en la esquina inferior izquierda.
  doc.save();
  doc.opacity(0.12);
  const glowX = 0;
  const glowY = 800;
  const glow = doc.radialGradient(glowX, glowY, 0, glowX, glowY, 950);
  glow.stop(0, COLORS.accent2);
  glow.stop(0.5, COLORS.accent2);
  glow.stop(1, COLORS.white);
  doc.rect(0, 0, PAGE.width, PAGE.height).fill(glow);
  doc.restore();

  // Se pidio bajar un poco mas el logo "VISTA360 PLAYER", esta vez
  // SOLO el logo (el encabezado/kicker de la izquierda se queda en su
  // sitio, ya no se mueven juntos como antes). Antes y:32, ahora y:42.
  doc.image(LOGO_PLAYER_BLACK, PAGE.width - PAGE.margin - 200, 42, { width: 200 });

  // El kicker dice "REGISTRO" (antes "EVIDENCIA") y el encabezado de
  // abajo dice "Evidencia N" (antes "Registro N") -- se pidio dar
  // vuelta cual de las dos palabras va arriba chico y cual abajo
  // grande.
  drawKicker(doc, `${pad2(pageNum)} / REGISTRO`, PAGE.margin, 32, COLORS.accent, 12);
  doc.font("Helvetica-Bold").fontSize(26).fillColor(COLORS.ink)
    .text(`Evidencia ${pad2(indice)}`, PAGE.margin, 66, { width: 760 });
  // Antes decia "Fecha de registro: ..." -- se pidio dejarlo mas
  // corto, solo "Fecha: ...".
  doc.font("Helvetica").fontSize(13).fillColor(COLORS.mutedOnLight)
    .text(`Fecha: ${fechaCorta(foto.fecha)}`, PAGE.margin, 102, { width: 760 });

  // Se saco la tarjeta flotante de la derecha (antes mostraba
  // "Evidencia N" y la fecha, ahora esa info ya esta arriba en el
  // encabezado) -- la foto ahora ocupa todo el ancho disponible,
  // centrada entre los mismos margenes que el resto de la pagina, en
  // vez de quedar achicada a la izquierda para dejarle sitio a la
  // tarjeta.
  // Un poco menos ancha que el ancho completo -- se probo primero a
  // todo el ancho (borde a borde con el margen de la pagina) y se
  // pidio achicarla un poco, que quede con mas aire a los costados.
  const photoInset = 130;
  const photoX = photoInset;
  const photoY = 134;
  const photoW = PAGE.width - photoInset * 2;
  const photoH = 684;
  const buffer = await cargarFotoComprimida(foto.url);
  drawImageCover(doc, buffer, photoX, photoY, photoW, photoH, 22);
  doc.roundedRect(photoX, photoY, photoW, photoH, 22).lineWidth(1).strokeColor(COLORS.lineLight).stroke();

  // Misma linea de acento en degradado que ya usa la divisoria de
  // panel (paginaPanel) -- empieza oscura, se aclara al medio y
  // vuelve oscura, efecto de brillo elegante en vez de un azul
  // plano. Se pidio ese mismo efecto tambien aca, en las paginas de
  // evidencia (blanca y oscura), no solo en la divisoria.
  // Barra mas delgada (66 vs los 103 de siempre) -- se pidio que el
  // pie de esta pagina sea mas fino, para dejarle mas espacio a la
  // foto. Solo aca y en la version oscura -- paginaPanel se queda con
  // el alto original.
  drawFooterBar(doc, pad2(pageNum), COLORS.accentDark, 5, [COLORS.accentDark, COLORS.accent2, COLORS.accentDark], 66);
}

/** Version oscura de paginaEvidenciaBlanca -- misma composicion (foto
 *  grande a la izquierda + tarjeta flotante a la derecha) con los
 *  colores invertidos: fondo azul oscuro, logo "PLAYER" totalmente
 *  blanco (el mismo LOGO_PLAYER_WHITE_MONO que ya usa paginaPanel) y
 *  la tarjeta flotante en BLANCO -- en la pagina blanca la tarjeta es
 *  oscura, aca al reves para que siga resaltando contra el fondo.
 *
 *  Se usa SOLO cuando el reporte es de un solo panel (ver conSecciones
 *  en generarReporte): ahi las paginas de evidencia alternan
 *  blanco/oscuro empezando en blanco, como antes. Con 2+ paneles no se
 *  usa -- esos reportes ya tienen una pagina oscura de por medio
 *  (paginaPanel) separando cada seccion, alternar tambien las
 *  evidencias ahi quedaria recargado. */
async function paginaEvidenciaOscura(
  doc: PDFKit.PDFDocument,
  foto: { url: string; fecha?: string },
  pageNum: number,
  indice: number
) {
  // Antes tenia el mismo brillo suave de la portada -- se pidio
  // sacarlo SOLO en esta pagina (evidencia oscura): que se quede
  // plana/oscura, sin luz azul, a diferencia de la portada y la
  // pagina blanca de evidencia (que sí la mantienen).
  doc.rect(0, 0, PAGE.width, PAGE.height).fill(COLORS.bg);

  // Mismo ajuste que en la version blanca: SOLO el logo baja un poco
  // mas (y:32 -> y:42), el encabezado/kicker se queda igual.
  doc.image(LOGO_PLAYER_WHITE_MONO, PAGE.width - PAGE.margin - 200, 42, { width: 200 });

  // Mismo cambio que en la version blanca (ver comentario ahi):
  // kicker "REGISTRO" arriba, "Evidencia N" abajo.
  drawKicker(doc, `${pad2(pageNum)} / REGISTRO`, PAGE.margin, 32, COLORS.accent2, 12);
  doc.font("Helvetica-Bold").fontSize(26).fillColor(COLORS.white)
    .text(`Evidencia ${pad2(indice)}`, PAGE.margin, 66, { width: 760 });
  // Mismo cambio que en la version blanca (ver comentario ahi):
  // "Fecha: ..." en vez de "Fecha de registro: ...".
  doc.font("Helvetica").fontSize(13).fillColor(COLORS.muted)
    .text(`Fecha: ${fechaCorta(foto.fecha)}`, PAGE.margin, 102, { width: 760 });

  // Mismo cambio que en la version blanca (ver comentario ahi): sin
  // tarjeta flotante, la foto ocupa todo el ancho disponible.
  // Un poco menos ancha que el ancho completo -- se probo primero a
  // todo el ancho (borde a borde con el margen de la pagina) y se
  // pidio achicarla un poco, que quede con mas aire a los costados.
  const photoInset = 130;
  const photoX = photoInset;
  const photoY = 134;
  const photoW = PAGE.width - photoInset * 2;
  const photoH = 684;
  const buffer = await cargarFotoComprimida(foto.url);
  drawImageCover(doc, buffer, photoX, photoY, photoW, photoH, 22);
  doc.roundedRect(photoX, photoY, photoW, photoH, 22).lineWidth(1).strokeColor(COLORS.line).stroke();

  // Antes tenia la misma linea de acento en degradado que la pagina
  // blanca de evidencia -- se pidio sacarla SOLO aca (evidencia
  // oscura), que el pie se quede plano/oscuro sin ninguna linea
  // azul, a diferencia de la pagina blanca (que si la mantiene).
  // stripHeight en 0 deja la franja de color invisible sin tener que
  // tocar el resto de drawFooterBar.
  drawFooterBar(doc, pad2(pageNum), COLORS.accentDark, 0, undefined, 66);
}

/** Datos de contacto de Vista360 para el pie de la pagina de cierre.
 *  TODO: mover esto a config/Firestore si se necesita cambiar sin
 *  tocar codigo. Por ahora son valores de prueba. */
const CIERRE_TITULO = "PUBLICIDAD EXTERIOR";
const CIERRE_SUBTITULO = "PANELES PREMIUM";
const CONTACTO_EMAIL = "gestion@vista360player.pe";
const CONTACTO_WEB = "www.vista360player.pe";
// Sin "+51" -- se pidio calcar la tarjeta de presentacion de
// referencia, ahi el numero va sin el codigo de pais.
const CONTACTO_TELEFONO = "947 957 971";

/** Icono de llamada/telefono, trazado con el mismo path SVG del icono
 *  "phone" de Feather Icons (viewBox 24x24) -- se dibuja con
 *  doc.path(), que entiende path-data SVG (incluidos los arcos "a"),
 *  escalado/posicionado con translate+scale. Se cambio del rectangulo
 *  redondeado anterior a este trazo de auricular porque se pidio
 *  calcar exactamente el icono de la tarjeta de presentacion de
 *  referencia. */
function drawPhoneIcon(doc: PDFKit.PDFDocument, x: number, y: number, size: number, color: string) {
  doc.save();
  doc.translate(x, y).scale(size / 24);
  doc.path(
    "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 " +
      "19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 " +
      "0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 " +
      "0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
  )
    .lineWidth(1.8)
    .strokeColor(color)
    .lineJoin("round")
    .lineCap("round")
    .stroke();
  doc.restore();
}

/** Icono de sobre/correo, mismo enfoque que drawPhoneIcon (path SVG de
 *  Feather Icons "mail", viewBox 24x24). */
function drawEmailIcon(doc: PDFKit.PDFDocument, x: number, y: number, size: number, color: string) {
  doc.save();
  doc.translate(x, y).scale(size / 24);
  doc.path("M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z")
    .lineWidth(1.6)
    .strokeColor(color)
    .lineJoin("round")
    .stroke();
  doc.path("M22 6l-10 7L2 6").lineWidth(1.6).strokeColor(color).lineJoin("round").lineCap("round").stroke();
  doc.restore();
}

/** Icono de globo/web, basado en Feather Icons "globe" (viewBox
 *  24x24). Mantiene exactamente el mismo tamaño y peso visual que los
 *  iconos de teléfono y correo. */
function drawWebsiteIcon(doc: PDFKit.PDFDocument, x: number, y: number, size: number, color: string) {
  doc.save();
  doc.translate(x, y).scale(size / 24);
  doc.circle(12, 12, 10).lineWidth(1.6).strokeColor(color).stroke();
  doc.path("M2 12h20").lineWidth(1.6).strokeColor(color).lineCap("round").stroke();
  doc.path("M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20z")
    .lineWidth(1.6)
    .strokeColor(color)
    .lineJoin("round")
    .stroke();
  doc.restore();
}

/** Cierre del reporte: calcado de la tarjeta de presentacion fisica
 *  de referencia -- fondo oscuro solido (sin el anillo decorativo,
 *  que solo va en la portada), wordmark "VISTA360" + tagline a la
 *  izquierda, raya divisoria vertical, y a la derecha nombre + cargo,
 *  telefono, correo y el rubro del negocio. */
function cierre(doc: PDFKit.PDFDocument) {
  // Ya no recibe totalPages -- se pidio que el cierre no tenga pie de
  // pagina (ni el texto "VISTA360 - REPORTE FOTOGRAFICO" ni el numero
  // de pagina), asi que ese dato ya no hace falta aca.
  //
  // Fondo: negro con un brillo suave concentrado abajo -- se pidio
  // que la luz se vea mas abajo, no repartida en toda la pagina, y
  // que de la mitad para arriba quede bien negro. Radio mas chico
  // (650, antes 1100) para que el degradado no llegue tan arriba.
  const glowX = PAGE.width * 0.5;
  const glowY = PAGE.height * 1.08;
  const glow = doc.radialGradient(glowX, glowY, 0, glowX, glowY, 650);
  glow.stop(0, "#152544");
  glow.stop(0.45, "#0e1830");
  glow.stop(1, COLORS.bg);
  doc.rect(0, 0, PAGE.width, PAGE.height).fill(glow);

  // Centro vertical real de la pagina (450 de 900) -- se pidio que
  // tanto el logo como la raya divisoria queden centrados en el
  // vertical de la pagina, no solo en el horizontal.
  const pageCenterY = PAGE.height / 2;

  // La raya divisoria esta centrada en el horizontal (800 de 1600) y
  // ahora tambien simetrica en el vertical alrededor de pageCenterY
  // (antes 300-700, centrada en 500, no en el centro real de 450).
  const dividerX = PAGE.width / 2;
  const leftColX = PAGE.margin;
  const leftColW = dividerX - 40 - leftColX;
  // Columna derecha corrida mas a la derecha (separacion de la raya
  // 56 -> 100) -- se pidio mas espacio ahi, que no quede pegada a la
  // raya y ocupe mejor su mitad de la pagina.
  const rightColX = dividerX + 100;
  const rightColW = PAGE.width - PAGE.margin - rightColX;
  const dividerY1 = pageCenterY - 230;
  const dividerY2 = pageCenterY + 230;
  // Mismo gris azulado sutil que usa la referencia para la raya y los
  // iconos -- mas claro que COLORS.line (pensada para fondos claros
  // dentro de tarjetas), para que se note contra el fondo oscuro.
  const iconColor = "#c7cfdd";

  // ── Columna izquierda: wordmark "VISTA360" + tagline, mucho mas
  // grandes que antes y centrados en el centro vertical REAL de la
  // pagina (pageCenterY), no en el centro de la raya (que antes
  // quedaba mas abajo, en 500).
  const logoW = 560;
  const logoH = logoW / (1170 / 124);
  const tag1 = "MÁS QUE VISIBILIDAD.";
  const tag2 = "PRESENCIA.";
  const tag1Size = 38;
  const tag2Size = 26;
  const gapLogoTag = 48;
  const gapTags = 18;
  const blockH = logoH + gapLogoTag + tag1Size + gapTags + tag2Size;
  const logoX = leftColX + (leftColW - logoW) / 2;
  const logoY = pageCenterY - blockH / 2;
  doc.image(LOGO_WORDMARK_WHITE, logoX, logoY, { width: logoW });

  // Tagline en blanco liso, sin color de acento ni rayita -- se
  // probo el tratamiento tipo "kicker" en azul y no era lo pedido,
  // asi que vuelve a como estaba antes.
  const tag1Y = logoY + logoH + gapLogoTag;
  doc.font("Helvetica-Bold").fontSize(tag1Size).fillColor(COLORS.white)
    .text(tag1, leftColX, tag1Y, { width: leftColW, align: "center", characterSpacing: 1.2 });
  const tag2Y = tag1Y + tag1Size + gapTags;
  doc.font("Helvetica-Bold").fontSize(tag2Size).fillColor(COLORS.white)
    .text(tag2, leftColX, tag2Y, { width: leftColW, align: "center", characterSpacing: 2 });

  // ── Raya divisoria vertical ──
  doc.moveTo(dividerX, dividerY1).lineTo(dividerX, dividerY2).lineWidth(1.5).strokeColor("#2a3852").stroke();

  // ── Columna derecha: nombre, cargo, raya horizontal y contacto ──
  // Centrada en pageCenterY igual que la columna izquierda.
  const rBlockH = 410;
  const rTop = pageCenterY - rBlockH / 2;
  doc.font("Helvetica-Bold").fontSize(42).fillColor(COLORS.white)
    .text(CIERRE_TITULO, rightColX, rTop, { width: rightColW });
  doc.font("Helvetica-Bold").fontSize(19).fillColor(COLORS.muted)
    .text(CIERRE_SUBTITULO, rightColX, rTop + 66, { characterSpacing: 1.5, width: rightColW });

  doc.moveTo(rightColX, rTop + 124).lineTo(rightColX + rightColW, rTop + 124).lineWidth(1).strokeColor("#26324a").stroke();

  drawPhoneIcon(doc, rightColX, rTop + 164, 32, iconColor);
  doc.font("Helvetica-Bold").fontSize(26).fillColor(COLORS.white)
    .text(CONTACTO_TELEFONO, rightColX + 46, rTop + 170, { width: rightColW - 46 });

  drawEmailIcon(doc, rightColX, rTop + 230, 32, iconColor);
  doc.font("Helvetica-Bold").fontSize(26).fillColor(COLORS.white)
    .text(CONTACTO_EMAIL, rightColX + 46, rTop + 236, { width: rightColW - 46 });

  // Tercera fila con la MISMA separación vertical de 66 pt que hay
  // entre teléfono y correo: icono 164/230/296, texto 170/236/302.
  drawWebsiteIcon(doc, rightColX, rTop + 296, 32, iconColor);
  doc.font("Helvetica-Bold").fontSize(26).fillColor(COLORS.white)
    .text(CONTACTO_WEB, rightColX + 46, rTop + 302, { width: rightColW - 46 });

  // Remate institucional: evita repetir el titulo/subtitulo y resume
  // la promesa de marca con el mismo tratamiento elegante del rubro.
  doc.font("Helvetica-Bold").fontSize(18).fillColor(COLORS.muted)
    .text("VISIBILIDAD · PRESENCIA · IMPACTO", rightColX, rTop + 374, { characterSpacing: 1, width: rightColW });
}

/** Divisoria de panel -- fondo OSCURO solido a todo lo ancho (antes
 *  era azul, se pidio que sea oscuro en su totalidad, igual que el
 *  resto de paginas oscuras del reporte -- portada, cierre, etc).
 *  Mismo diseño para cualquier panel de la campaña. La barra del pie
 *  de pagina no cambia, sigue con la franja de acento azul. */
function paginaPanel(doc: PDFKit.PDFDocument, nombrePanel: string, ubicacion: string, pageNum: number, indiceSeccion: number, totalSecciones: number) {
  // Fondo oscuro (antes era azul solido) -- se pidio que ya no sea
  // azul claro, que sea oscuro en su totalidad.
  doc.rect(0, 0, PAGE.width, PAGE.height).fill(COLORS.bg);

  // Logo totalmente blanco (sin nada de azul) -- se pidio
  // especificamente para esta pagina.
  doc.image(LOGO_PLAYER_WHITE_MONO, PAGE.width - PAGE.margin - 200, 52, { width: 200 });

  const leftX = PAGE.margin;
  const y0 = PAGE.height * 0.34;
  // "PANEL X DE Y" mas grande que antes (16 -> 24) y SOLO con la
  // rayita de abajo (la que dibuja drawKicker) -- se saco la otra
  // rayita que habia arriba del todo, quedaba una encima y otra abajo
  // y se pidio que solo quede la de abajo.
  const kickerSize = 24;
  drawKicker(doc, `Panel ${indiceSeccion} de ${totalSecciones}`, leftX, y0, COLORS.white, kickerSize);

  // Mas espacio entre la rayita del kicker y el titulo (antes quedaban
  // pegados) -- la rayita de drawKicker cae en y0 + kickerSize + 8.
  const kickerLineY = y0 + kickerSize + 8;
  const tituloY = kickerLineY + 34;

  const maxWidth = PAGE.width - leftX - PAGE.margin - 220;
  const titulo = sinTildes(nombrePanel).toUpperCase();
  // Letra mas grande que antes (era 64/32 de maximo/minimo) ya que
  // ahora hay mas ancho disponible sin la franja blanca.
  const tituloSize = tamanoQueEntra(doc, titulo, maxWidth, "Helvetica-Bold", 76, 38);
  doc.font("Helvetica-Bold").fontSize(tituloSize).fillColor(COLORS.white)
    .text(titulo, leftX, tituloY, { width: maxWidth });

  const tituloHeight = doc.heightOfString(titulo, { width: maxWidth });
  if (ubicacion && sinTildes(ubicacion) !== titulo) {
    // Blanco con opacidad reducida -- se sigue leyendo bien como texto
    // secundario sobre el fondo oscuro, sin competir con el titulo.
    doc.save();
    doc.fillOpacity(0.72);
    doc.font("Helvetica").fontSize(19).fillColor(COLORS.white)
      .text(sinTildes(ubicacion), leftX, tituloY + tituloHeight + 18, { width: maxWidth });
    doc.restore();
  }

  // Linea de acento como degradado -- empieza oscura, se aclara al
  // medio y vuelve oscura, efecto de brillo elegante en vez de un
  // azul plano.
  drawFooterBar(doc, pad2(pageNum), COLORS.accentDark, 5, [COLORS.accentDark, COLORS.accent2, COLORS.accentDark]);
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
      // Con un solo panel (sin secciones/paginaPanel de por medio) las
      // paginas de evidencia alternan blanco/oscuro empezando en
      // blanco -- como era originalmente, antes de que se simplificara
      // a un solo diseño. Con 2+ paneles se dejan todas en blanco: ahi
      // ya hay una pagina oscura (paginaPanel) separando cada seccion,
      // alternar tambien las evidencias quedaria recargado.
      if (!conSecciones && i % 2 === 1) {
        await paginaEvidenciaOscura(doc, fotosElemento[i], pageNum, i + 1);
      } else {
        await paginaEvidenciaBlanca(doc, fotosElemento[i], pageNum, i + 1);
      }
      pageNum++;
      numEvidencias++;
    }
  }

  doc.addPage();
  cierre(doc);
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
    .filter((foto) => typeof foto.url === "string" && (foto.url.startsWith("data:image/") || esClaveR2(foto.url)))
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
      .filter((foto) => typeof foto.url === "string" && (foto.url.startsWith("data:image/") || esClaveR2(foto.url)))
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
    // Se recogen ANTES de hacer nada: si la generación falla a mitad,
    // igual hay que borrarlas. Lo único que debe quedar en R2 es el
    // reporte terminado -- las fotos sueltas no sirven para nada una vez
    // que están dentro del PDF, y sueltas solo ocupan espacio.
    const clavesTemporales: string[] = [];
    const listaPanelesEntrada = request.data?.panelesFotos;
    if (Array.isArray(listaPanelesEntrada)) {
      listaPanelesEntrada.forEach((p: unknown) => {
        const fotos = (p as { fotos?: unknown })?.fotos;
        if (!Array.isArray(fotos)) return;
        fotos.forEach((f: unknown) => {
          const u = (f as { url?: unknown })?.url;
          if (typeof u === "string" && esClaveR2(u)) clavesTemporales.push(u);
        });
      });
    }

    try {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

      const db = getFirestore();
      const userSnap = await db.doc(`portalUsers/${uid}`).get();
      const user = userSnap.data();
      if (!userSnap.exists || !esPersonalInterno(user?.role)) {
        throw new HttpsError("permission-denied", "Solo el equipo interno puede generar reportes.");
      }

      const clienteId = exigirId(request.data?.clienteId, "clienteId");
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

      const panelId = idOpcional(request.data?.panelId, "panelId");
      const contratoId = idOpcional(request.data?.contratoId, "contratoId");

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
        // Con un solo panel el rotulo de la portada dice "UBICACION"
        // (ver portada() mas abajo), asi que ahi si tiene que ir la
        // direccion completa (nombre - direccion - ciudad), no solo el
        // nombre del panel -- para eso usa `.ubicacion` de cada
        // elemento (ya viene armada asi en cargarElementosSubidosPorPanel)
        // en vez de `.titulo` (que es solo el nombre, pensado para el
        // rotulo "PANELES" cuando son 2+ y no hay una sola direccion
        // que mostrar).
        ubicacion = elementosPorPanel.length === 1
          ? (elementosPorPanel[0].ubicacion || elementosPorPanel[0].titulo || ubicacionDb || "Perú")
          : (elementosPorPanel.map((e) => e.titulo).join(" + ") || ubicacionDb || "Perú");
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

      // Las fotos ya están dentro del PDF: las copias sueltas en R2 no
      // sirven para nada más y solo ocuparían espacio. Se borran acá para
      // no depender de una limpieza posterior.

      // Avisar al cliente que ya tiene su reporte. Reemplaza a la vieja
      // notificación de "nueva evidencia": esa dependía de la pantalla de
      // Evidencias, que dejó de usarse -- ahora las fotos se suben como
      // parte del reporte mensual, así que este es el momento real en que
      // el cliente tiene algo nuevo que ver.
      //
      // No se deja que un fallo del push tumbe la generación: el PDF ya
      // está creado y guardado, y quedarse sin avisar es mucho menos grave
      // que devolver un error después de haber hecho todo el trabajo.
      try {
        await enviarPushACliente(clienteId, {
          title: "Tu reporte ya está listo",
          body: `Ya puedes ver el reporte de ${nombreFechaCorta(fecha)}.`,
          url: "/",
        });
      } catch (error) {
        console.error("El reporte se generó pero no se pudo avisar al cliente.", error);
      }

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
    } finally {
      // En finally a propósito: si la generación se cayó a mitad, esas
      // fotos ya subidas quedarían huérfanas en R2 para siempre. Así se
      // limpian pase lo que pase.
      // borrarObjetoR2 no lanza -- un fallo acá no debe tapar el error real
      // ni tumbar un reporte que sí se generó bien.
      if (clavesTemporales.length > 0) {
        await Promise.all(clavesTemporales.map((k) => borrarObjetoR2(k)));
      }
    }
  }
);
