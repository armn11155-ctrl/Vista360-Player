
import { useEffect, useState } from "react";

const PREFIJO_VISOR = "vista360:visor-pdf:";

type DatosVisor = {
  url: string;
  nombre: string;
};

function esPwaIOS(): boolean {
  const ua = navigator.userAgent || "";
  const esIOS =
    /iPhone|iPad|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
  const navigatorIOS = navigator as Navigator & { standalone?: boolean };
  const instalada =
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorIOS.standalone === true;
  return esIOS && instalada;
}

export default function VisorPdf() {
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");
  const [urlLocal, setUrlLocal] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("visor-pdf") || "";
    const clave = PREFIJO_VISOR + token;
    let datos: DatosVisor | null = null;

    try {
      const guardado = window.sessionStorage.getItem(clave);
      window.sessionStorage.removeItem(clave);
      if (guardado) datos = JSON.parse(guardado) as DatosVisor;
    } catch {
      datos = null;
    }

    if (!datos?.url) {
      setEstado("error");
      return;
    }

    const titulo = (datos.nombre || "Documento").replace(/\.pdf$/i, "");
    document.title = titulo;

    const corte = new AbortController();
    const reloj = window.setTimeout(() => corte.abort(), 20_000);
    let blobUrl = "";
    let navegacionNativa = false;

    fetch(datos.url, { signal: corte.signal })
      .then((respuesta) => {
        if (!respuesta.ok) throw new Error("HTTP " + respuesta.status);
        return respuesta.blob();
      })
      .then((blob) => {
        blobUrl = URL.createObjectURL(
          blob.type ? blob : new Blob([blob], { type: "application/pdf" }),
        );

        // El <embed> de una PWA de iOS no ofrece zoom ni los controles del
        // PDF. Como navegación principal, WebKit usa su visor nativo y sí
        // permite pellizcar, acercar, alejar y recorrer todas las páginas.
        if (esPwaIOS()) {
          navegacionNativa = true;
          window.location.replace(blobUrl);
          return;
        }

        setUrlLocal(blobUrl);
        setEstado("listo");
      })
      .catch(() => setEstado("error"))
      .finally(() => window.clearTimeout(reloj));

    return () => {
      corte.abort();
      window.clearTimeout(reloj);
      if (blobUrl && !navegacionNativa) URL.revokeObjectURL(blobUrl);
    };
  }, []);

  if (estado === "error") {
    return (
      <main style={pantalla}>
        <p>No se pudo abrir el documento. Vuelve a la aplicación e inténtalo otra vez.</p>
      </main>
    );
  }

  if (estado === "cargando") {
    return (
      <main style={pantalla}>
        <p>Abriendo el documento…</p>
      </main>
    );
  }

  return (
    <embed
      src={urlLocal}
      type="application/pdf"
      aria-label="Documento PDF"
      style={{ display: "block", width: "100vw", height: "100vh", border: 0 }}
    />
  );
}

const pantalla = {
  alignItems: "center",
  background: "#050a12",
  color: "#dce6f5",
  display: "flex",
  fontFamily: "system-ui, sans-serif",
  height: "100vh",
  justifyContent: "center",
  margin: 0,
  padding: "24px",
  textAlign: "center" as const,
};
