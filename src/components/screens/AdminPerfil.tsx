import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { cloudFunctions, logout } from "../../config/firebase";
import { subirAvatarR2 } from "../../config/r2";
import { comprimirAvatarWebp, type PosicionRecorte } from "../../utils/comprimirImagen";
import { useAvatarPropio } from "../../hooks/useAvatarPropio";
import BackChevron from "../BackChevron";
import { BrandThumb } from "../BrandThumb";
import { AvatarUploadModal } from "../AvatarUploadModal";

interface Props {
  uid: string;
  nombre: string;
  email: string;
  onBack: () => void;
}

function formatoEspacio(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

type EspacioEstado = { status: "loading" | "ready" | "error"; bytes?: number; objetos?: number };

/** Espacio total usado en R2 (todos los clientes juntos), en vivo — no cacheado. */
function useEspacioR2(): EspacioEstado {
  const [estado, setEstado] = useState<EspacioEstado>({ status: "loading" });

  useEffect(() => {
    if (!cloudFunctions) {
      setEstado({ status: "error" });
      return;
    }
    let cancelado = false;
    const fn = httpsCallable<Record<string, never>, { totalBytes: number; totalObjetos: number }>(
      cloudFunctions,
      "obtenerEspacioR2"
    );
    fn()
      .then(({ data }) => {
        if (!cancelado) setEstado({ status: "ready", bytes: data.totalBytes, objetos: data.totalObjetos });
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

/**
 * Perfil del administrador — separado del Perfil.tsx de los clientes.
 * Se abre desde el ícono en la esquina del selector de cuentas.
 * Muestra identidad (con foto propia editable) + espacio usado en R2.
 */
export default function AdminPerfil({ uid, nombre, email, onBack }: Props) {
  const espacio = useEspacioR2();
  const avatarUrl = useAvatarPropio(uid);
  const [modalAvatarAbierto, setModalAvatarAbierto] = useState(false);

  async function subirNuevaFoto(file: File, posicion: PosicionRecorte) {
    if (!cloudFunctions) {
      throw new Error("Firebase Functions no está configurado.");
    }
    const webp = await comprimirAvatarWebp(file, posicion);
    const { key: url } = await subirAvatarR2(webp);
    // No hace falta setear el estado local: useAvatarPropio escucha el
    // mismo documento en vivo y se actualiza solo apenas se confirma
    // el guardado (también refleja el cambio en el ícono "Mi perfil"
    // del selector de cuentas, que usa el mismo hook).
    const fn = httpsCallable<{ avatarUrl: string }, { avatarUrl: string }>(cloudFunctions, "actualizarAvatarPropio");
    await fn({ avatarUrl: url });
  }

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
          <div style={{ width: 76, height: 76, marginBottom: 14 }}>
            <button
              type="button"
              className="profile-avatar-hover-btn"
              style={{ borderRadius: "50%" }}
              onClick={() => setModalAvatarAbierto(true)}
              aria-label="Cambiar foto de perfil"
            >
              <BrandThumb name={nombre || "Administrador"} avatarUrl={avatarUrl} size={76} radius={38} iconScale={0.72} />
              <span className="profile-avatar-camera-overlay" aria-hidden="true" style={{ borderRadius: "50%" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
                  <circle cx="12" cy="13" r="3.4" />
                </svg>
              </span>
            </button>
          </div>
          <div className="admin-perfil-nombre">{nombre || "Administrador"}</div>
          <div className="admin-perfil-email">{email}</div>
          <span className="profile-verified">
            <span className="profile-verified-mark" aria-hidden="true">
              <img src="/verified-check.svg" alt="" />
            </span>
            <span>Cuenta administrador</span>
          </span>
        </div>

        {modalAvatarAbierto && (
          <AvatarUploadModal
            titulo="Cambiar foto de perfil"
            etiquetaMiniatura="Así se ve tu ícono"
            onSubir={subirNuevaFoto}
            onCerrar={() => setModalAvatarAbierto(false)}
          />
        )}

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
