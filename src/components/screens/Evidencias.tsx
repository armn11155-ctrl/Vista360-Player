import { useRef, useState } from "react";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import type { Contrato, Panel } from "../../types";
import { panelesDeContrato } from "../../types";
import { db } from "../../config/firebase";
import { subirEvidenciaR2 } from "../../config/r2";
import { comprimirImagen } from "../../utils/comprimirImagen";
import { esVideo, keyDeMiniatura } from "../../utils/r2Media";
import { useSignedUrls } from "../../hooks/useSignedUrls";

function CameraIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#0877FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function GalleryIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function Spinner({ size = 26 }: { size?: number }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        border: "3px solid rgba(8,119,255,0.15)", borderTopColor: "#0877FF",
        animation: "spin 0.8s linear infinite", margin: "0 auto",
      }}
    />
  );
}

interface Props {
  contratos: Contrato[];
  paneles: Record<string, Panel>;
  isAdmin?: boolean;
}

interface FotoConContexto {
  url: string;
  thumbKey?: string;
  fecha: string;
  panelNombre: string;
  contratoId: string;
}

export default function Evidencias({ contratos, paneles, isAdmin }: Props) {
  function nombrePanelesContrato(c: Contrato) {
    const ids = panelesDeContrato(c);
    return ids.length > 0 ? ids.map((id) => paneles[id]?.nombre ?? id).join(" + ") : "";
  }

  const fileRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [contratoSeleccionado, setContratoSeleccionado] = useState<string>("");

  const fotos: FotoConContexto[] = [];
  for (const c of contratos) {
    for (const f of c.fotos_campania ?? []) {
      fotos.push({
        url: f.url,
        thumbKey: f.thumbKey,
        fecha: f.fecha,
        panelNombre: nombrePanelesContrato(c) || c.panel_id,
        contratoId: c.id,
      });
    }
  }
  fotos.sort((a, b) => b.fecha.localeCompare(a.fecha));

  const grupos = new Map<string, FotoConContexto[]>();
  for (const f of fotos) {
    const key = f.fecha.split(" ")[0] ?? f.fecha;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key)!.push(f);
  }

  const keysAFirmar = fotos.flatMap((f) => [f.url, f.thumbKey].filter((k): k is string => Boolean(k)));
  const urlsFirmadas = useSignedUrls(keysAFirmar);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !db) return;
    if (!contratoSeleccionado && contratos.length > 1) {
      setError("Selecciona primero a qué campaña pertenece esta evidencia.");
      return;
    }
    const targetId = contratoSeleccionado || contratos[0]?.id;
    if (!targetId) { setError("No hay campañas disponibles."); return; }

    setError(""); setExito(""); setSubiendo(true);
    try {
      const archivoOptimizado = await comprimirImagen(file);
      const { key: url, thumbKey } = await subirEvidenciaR2(archivoOptimizado);
      const fecha = new Date().toISOString().slice(0, 10);
      await updateDoc(doc(db, "contratos", targetId), {
        fotos_campania: arrayUnion(thumbKey ? { url, thumbKey, fecha } : { url, fecha }),
      });
      setExito("✓ Evidencia subida correctamente");
      setTimeout(() => setExito(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir. Intenta de nuevo.");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="evidencias-header reports-header">
        <div className="ev-logo-row">
          <div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>Evidencias</div>
        </div>
      </div>

      <div className="ev-content" style={{ flex: 1, overflowY: "auto" }}>

        {/* Zona de subida — solo admin */}
        {isAdmin && (
          <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0B1220", marginBottom: 12, display: "flex", alignItems: "center", gap: 7 }}>
              <CameraIcon size={16} /> Subir evidencia
            </div>

            {/* Selector de campaña si hay más de una */}
            {contratos.length > 1 && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 6 }}>
                  Campaña / Panel
                </label>
                <select
                  value={contratoSeleccionado}
                  onChange={(e) => setContratoSeleccionado(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 14, color: "#0B1220", background: "#fff", boxSizing: "border-box" as const }}
                >
                  <option value="">Selecciona una campaña…</option>
                  {contratos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {nombrePanelesContrato(c) || c.panel_id} ({c.inicio} – {c.fin})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {error && (
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#DC2626", padding: "10px 12px", borderRadius: 10, fontSize: 12, marginBottom: 10 }}>
                {error}
              </div>
            )}
            {exito && (
              <div style={{ background: "rgba(34,197,94,0.1)", border: "1px solid #BBF7D0", color: "#16A34A", padding: "10px 12px", borderRadius: 10, fontSize: 12, marginBottom: 10 }}>
                {exito}
              </div>
            )}

            <input ref={fileRef} type="file" accept="image/*,video/*" capture="environment" style={{ display: "none" }} onChange={handleFile} />
            <div
              onClick={() => !subiendo && fileRef.current?.click()}
              style={{
                border: "2px dashed #BFDBFE", borderRadius: 14, padding: "20px 16px",
                textAlign: "center", cursor: subiendo ? "default" : "pointer",
                background: subiendo ? "#F0F9FF" : "#EFF6FF",
              }}
            >
              {subiendo ? (
                <>
                  <div style={{ marginBottom: 8 }}><Spinner /></div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0877FF" }}>Subiendo…</div>
                </>
              ) : (
                <>
                  <div style={{ marginBottom: 8, display: "flex", justifyContent: "center" }}><CameraIcon size={30} /></div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0877FF" }}>Toca para agregar foto o video</div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>JPG, PNG, MP4 · Máx. 20MB</div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Galería */}
        {fotos.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 24px", color: "#9CA3AF" }}>
            <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}><GalleryIcon /></div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Sin evidencias aún</div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              {isAdmin
                ? "Usa el botón de arriba para subir la primera evidencia."
                : "Aquí verás las fotos de tus anuncios en las pantallas en cuanto el equipo las suba."}
            </div>
          </div>
        ) : (
          Array.from(grupos.entries()).map(([fecha, items]) => (
            <div key={fecha}>
              <div className="ev-section-title">{fecha}</div>
              <div className="photo-grid">
                {items.map((f, i) => {
                  const esUrlVieja = f.url.startsWith("http");
                  const hrefCompleto = esUrlVieja ? f.url : urlsFirmadas[f.url];
                  const thumbKeyElegida = keyDeMiniatura(f.url, f.thumbKey);
                  const srcThumb = esUrlVieja
                    ? f.url
                    : thumbKeyElegida
                    ? urlsFirmadas[thumbKeyElegida]
                    : undefined;
                  if (!hrefCompleto || !srcThumb) return null;
                  return (
                    <a className="photo-item" key={`${fecha}-${i}`} href={hrefCompleto} target="_blank" rel="noreferrer">
                      <img
                        src={srcThumb}
                        className="evidence-photo-real"
                        alt={`Evidencia ${f.panelNombre}`}
                        loading="lazy"
                        decoding="async"
                      />
                      {esVideo(f.url) && (
                        <div className="photo-type-icon" aria-hidden="true">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      )}
                      <div className="photo-overlay">
                        <div className="photo-time">{f.fecha}</div>
                        <div className="photo-loc">{f.panelNombre}</div>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          ))
        )}
        <div style={{ height: 16 }} />
      </div>
    </div>
  );
}
