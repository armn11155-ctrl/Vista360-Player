import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./styles/visor-pdf.css";

GlobalWorkerOptions.workerSrc = workerUrl;

const CLAVE_VISOR = "vista360:visor-pdf";
const paginas = document.getElementById("paginas") as HTMLElement;
const estado = document.getElementById("estado") as HTMLElement;
const titulo = document.getElementById("documento-titulo") as HTMLElement;
const zoomMenos = document.getElementById("zoom-menos") as HTMLButtonElement;
const zoomMas = document.getElementById("zoom-mas") as HTMLButtonElement;
const zoomValor = document.getElementById("zoom-valor") as HTMLOutputElement;
const descargar = document.getElementById("descargar") as HTMLButtonElement;

let pdf: PDFDocumentProxy | null = null;
let bytes: Uint8Array<ArrayBuffer> | null = null;
let nombre = "Reporte Vista360.pdf";
let zoom = 1;
let renderizando = false;
let renderPendiente = false;

function mostrarError(mensaje: string) {
  paginas.setAttribute("aria-busy", "false");
  paginas.replaceChildren();
  const aviso = document.createElement("div");
  aviso.className = "visor-status visor-error";
  aviso.setAttribute("role", "alert");
  aviso.textContent = mensaje;
  paginas.appendChild(aviso);
}

function actualizarControles() {
  zoomValor.value = `${Math.round(zoom * 100)}%`;
  zoomMenos.disabled = zoom <= 0.6;
  zoomMas.disabled = zoom >= 2;
}

async function renderizarPaginas() {
  if (!pdf) return;
  if (renderizando) {
    renderPendiente = true;
    return;
  }

  renderizando = true;
  do {
    renderPendiente = false;
    paginas.setAttribute("aria-busy", "true");
    paginas.replaceChildren();

    const anchoDisponible = Math.max(280, Math.min(window.innerWidth - 24, 980));
    const densidad = Math.min(window.devicePixelRatio || 1, 1.6);

    for (let numero = 1; numero <= pdf.numPages; numero += 1) {
      if (renderPendiente) break;
      const pagina = await pdf.getPage(numero);
      const base = pagina.getViewport({ scale: 1 });
      const escala = (anchoDisponible / base.width) * zoom;
      const vista = pagina.getViewport({ scale: escala });
      const lienzo = document.createElement("canvas");
      lienzo.className = "visor-page";
      lienzo.setAttribute("aria-label", `Página ${numero} de ${pdf.numPages}`);
      lienzo.width = Math.max(1, Math.floor(vista.width * densidad));
      lienzo.height = Math.max(1, Math.floor(vista.height * densidad));
      lienzo.style.width = `${Math.floor(vista.width)}px`;
      lienzo.style.height = `${Math.floor(vista.height)}px`;
      paginas.appendChild(lienzo);

      const contexto = lienzo.getContext("2d", { alpha: false });
      if (!contexto) throw new Error("No se pudo preparar la página.");
      await pagina.render({
        canvas: lienzo,
        canvasContext: contexto,
        viewport: vista,
        transform: densidad === 1 ? undefined : [densidad, 0, 0, densidad, 0, 0],
      }).promise;
    }
  } while (renderPendiente);

  paginas.setAttribute("aria-busy", "false");
  renderizando = false;
}

function cambiarZoom(delta: number) {
  zoom = Math.min(2, Math.max(0.6, Math.round((zoom + delta) * 10) / 10));
  actualizarControles();
  void renderizarPaginas();
}

zoomMenos.addEventListener("click", () => cambiarZoom(-0.1));
zoomMas.addEventListener("click", () => cambiarZoom(0.1));

descargar.addEventListener("click", () => {
  if (!bytes) return;
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre.replace(/[\\/:*?"<>|]/g, "-");
  enlace.rel = "noreferrer";
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
});

let relojResize = 0;
window.addEventListener("resize", () => {
  window.clearTimeout(relojResize);
  relojResize = window.setTimeout(() => void renderizarPaginas(), 220);
});

async function iniciar() {
  let datos: { url?: unknown; nombre?: unknown } | null = null;
  try {
    const guardado = sessionStorage.getItem(CLAVE_VISOR);
    sessionStorage.removeItem(CLAVE_VISOR);
    if (guardado) datos = JSON.parse(guardado) as { url?: unknown; nombre?: unknown };
  } catch {
    datos = null;
  }

  if (!datos || typeof datos.url !== "string" || !datos.url) {
    mostrarError("No se pudo abrir el reporte. Cierra esta pestaña y vuelve a intentarlo.");
    return;
  }

  nombre = typeof datos.nombre === "string" && datos.nombre ? datos.nombre : nombre;
  titulo.textContent = nombre.replace(/\.pdf$/i, "");
  document.title = `${titulo.textContent} - Vista360 Player`;
  history.replaceState(null, "", "/");

  const corte = new AbortController();
  const reloj = window.setTimeout(() => corte.abort(), 30_000);
  try {
    const respuesta = await fetch(datos.url, { signal: corte.signal });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const buffer = await respuesta.arrayBuffer();
    bytes = new Uint8Array(buffer);
    pdf = await getDocument({ data: bytes.slice() }).promise;
    estado.remove();
    descargar.disabled = false;
    actualizarControles();
    await renderizarPaginas();
  } catch {
    mostrarError("No se pudo mostrar el reporte. Revisa tu conexión y vuelve a intentarlo.");
  } finally {
    window.clearTimeout(reloj);
  }
}

descargar.disabled = true;
actualizarControles();
void iniciar();
