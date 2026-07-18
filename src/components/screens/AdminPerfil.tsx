import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { cloudFunctions, logout } from "../../config/firebase";
import BackChevron from "../BackChevron";

interface Props {
  nombre: string;
  email: string;
  onBack: () => void;
}

function formatoEspacio(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

type EspacioEstado = {
  status: "loading" | "ready" | "error";
  bytes?: number;
  objetos?: number;
  bucket?: string;
  paginas?: number;
  muestra?: { key: string; size: number }[];
};

/** Espacio total usado en R2 (todos los clientes juntos), en vivo — no cacheado. */
function useEspacioR2(): EspacioEstado {
  const [estado, setEstado] = useState<EspacioEstado>({ status: "loading" });

  useEffect(() => {
    if (!cloudFunctions) {
      setEstado({ status: "error" });
      return;
    }
    let cancelado = false;
    const fn = httpsCallable<
      Record<string, never>,
      { totalBytes: number; totalObjetos: number; bucket: string; paginas: number; muestra: { key: string; size: number }[] }
    >(cloudFunctions, "obtenerEspacioR2");
    fn()
      .then(({ data }) => {
        if (!cancelado) {
          setEstado({
            status: "ready",
            bytes: data.totalBytes,
            objetos: data.totalObjetos,
            bucket: data.bucket,
            paginas: data.paginas,
            muestra: data.muestra,
          });
        }
      })
      .catch(() => {
        if (!cancelado) setEstado({ status: "error" });
      });
    return () => {
      cancelado = true;
    };
  }, []);

  return estado;
}

function inicialesDe(nombre: string) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "A";
  return partes.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

/**
 * Perfil del administrador — separado del Perfil.tsx de los clientes.
 * Se abre desde el ícono en la esquina del selector de cuentas. Por
 * ahora solo muestra identidad + espacio usado en R2, pero queda listo
 * para sumar más métricas de cuenta más adelante.
 */
export default function AdminPerfil({ nombre, email, onBack }: Props) {
  const espacio = useEspacioR2();

  return (
    <div className="admin-tool-screen">
      <div className="detail-header">
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Mi perfil</div>
        <div style={{ width: 32 }} />
      </div>

      <div className="content-area">
        <div className="admin-perfil-hero">
          <div className="admin-perfil-avatar">{inicialesDe(nombre)}</div>
          <div className="admin-perfil-nombre">{nombre || "Administrador"}</div>
          <div className="admin-perfil-email">{email}</div>
          <span className="profile-verified">
            <span className="profile-verified-mark" aria-hidden="true">
              <img src="/verified-check.svg" alt="" />
            </span>
            <span>Cuenta administrador</span>
          </span>
        </div>

        <section className="profile-section" style={{ marginTop: 24 }}>
          <h2>Almacenamiento</h2>
          <div className="profile-card-list">
            <div className="profile-metric-card">
              <div className="profile-metric-row blue">
                <span className="profile-metric-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                    <ellipse cx="12" cy="5" rx="8" ry="3" />
                    <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
                    <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
                  </svg>
                </span>
                <span className="profile-metric-label">
                  Espacio usado en R2
                  {espacio.status === "ready" && espacio.objetos !== undefined && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", marginTop: 2 }}>
                      {espacio.objetos} archivo{espacio.objetos === 1 ? "" : "s"} en total
                    </div>
                  )}
                </span>
                <strong>
                  {espacio.status === "ready" && espacio.bytes !== undefined
                    ? formatoEspacio(espacio.bytes)
                    : espacio.status === "error"
                      ? "—"
                      : "…"}
                </strong>
              </div>
            </div>
          </div>
        </section>

        {espacio.status === "ready" && espacio.muestra && (
          <section className="profile-section">
            <h2>Diagnóstico (temporal)</h2>
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", padding: 12, fontSize: 11.5 }}>
              <div style={{ marginBottom: 8, color: "#64748B" }}>
                Bucket: <strong style={{ color: "#0B1220" }}>{espacio.bucket}</strong> · Páginas leídas: {espacio.paginas} · Archivos encontrados: {espacio.objetos}
              </div>
              {espacio.muestra.map((item) => (
                <div key={item.key} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0", borderBottom: "1px solid #F1F5F9", fontFamily: "monospace" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.key}</span>
                  <span style={{ flexShrink: 0, color: "#64748B" }}>{(item.size / 1024).toFixed(1)} KB</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="profile-section">
          <h2>Cuenta</h2>
          <div className="profile-card-list">
            <button type="button" className="profile-row danger clickable" onClick={() => logout()}>
              <span className="profile-row-label">Cerrar sesión</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
