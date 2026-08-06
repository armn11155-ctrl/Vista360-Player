import { useEffect, useState } from "react";

const PREFIJO_VISOR = "vista360:visor-pdf:";

type DatosVisor = {
  url: string;
  nombre: string;
};

export default function VisorPdf() {
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");
  const [urlLocal, setUrlLocal] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("visor-pdf") || "";
    const clave = `${PREFIJO_VISOR}${token}`;
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

    fetch(datos.url, { signal: corte.signal })
      .then((respuesta) => {
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        return respuesta.blob();
      })
      .then((blob) => {
        blobUrl = URL.createObjectURL(
          blob.type ? blob : new Blob([blob], { type: "application/pdf" }),
        );
        setUrlLocal(blobUrl);
        setEstado("listo");
      })
      .catch(() => setEstado("error"))
      .finally(() => window.clearTimeout(reloj));

    return () => {
      corte.abort();
      window.clearTimeout(reloj);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
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
