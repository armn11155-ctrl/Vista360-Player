import { useEffect, useState } from "react";
import { mensajeDeError } from "../../utils/errores";
import { httpsCallable } from "firebase/functions";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { auth, cloudFunctions, logout } from "../../config/firebase";
import { subirAvatarR2 } from "../../config/r2";
import { comprimirAvatarWebp, type PosicionRecorte } from "../../utils/comprimirImagen";
import { useAvatarPropio } from "../../hooks/useAvatarPropio";
import BackChevron from "../BackChevron";
import { BrandThumb } from "../BrandThumb";
import { AvatarUploadModal } from "../AvatarUploadModal";
import { useDialogos } from "../DialogosProvider";

interface Props {
  uid: string;
  nombre: string;
  email: string;
  /** true para Gerente (antes "admin" a secas), false para Trabajador.
   *  Antes esta pantalla siempre decía "Administrador" sin importar
   *  el rol real -- lo veía tanto el Gerente como cualquier
   *  Trabajador al entrar a su propio "Mi perfil". */
  esGerente?: boolean;
  onBack: () => void;
}

function formatoEspacio(bytes: number) {
  // Dos decimales siempre -- antes MB mostraba solo uno (ej. "3.0")
  // mientras GB ya mostraba dos, inconsistente. Se pidió mas precision
  // para poder ver el uso real, no solo un numero redondeado.
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Plan gratuito de Cloudflare R2: 10 GB de almacenamiento incluidos. Si el
// día de mañana se contrata más espacio, este es el único número que hay
// que cambiar para que la barra de abajo refleje el límite real.
const LIMITE_ESPACIO_BYTES = 10 * 1024 * 1024 * 1024;

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

/** Resultado de revisar el bucket en busca de archivos que ya nadie usa. */
type Huerfano = { key: string; bytes: number; modificado: string };
type LimpiezaResultado = {
  totalObjetos: number;
  huerfanos: number;
  bytesHuerfanos: number;
  mbHuerfanos: number;
  muestra: Huerfano[];
  borrados: number;
  soloSimulacion: boolean;
};
type LimpiezaEstado =
  | { fase: "idle" }
  | { fase: "revisando" }
  | { fase: "revisado"; datos: LimpiezaResultado }
  | { fase: "borrando"; datos: LimpiezaResultado }
  | { fase: "listo"; datos: LimpiezaResultado }
  | { fase: "error"; mensaje: string };

/**
 * Perfil del administrador — separado del Perfil.tsx de los clientes.
 * Se abre desde el ícono en la esquina del selector de cuentas.
 * Muestra identidad (con foto propia editable) + espacio usado en R2.
 */
export default function AdminPerfil({ uid, nombre, email, esGerente = true, onBack }: Props) {
  const { confirmar } = useDialogos();
  const rolInterno = esGerente ? "Gerente" : "Trabajador";
  const espacio = useEspacioR2();
  const porcentajeUsado =
    espacio.status === "ready" && espacio.bytes !== undefined
      ? (espacio.bytes / LIMITE_ESPACIO_BYTES) * 100
      : 0;
  const avatarUrl = useAvatarPropio(uid);
  const [modalAvatarAbierto, setModalAvatarAbierto] = useState(false);

  // Cambiar contraseña -- se pidio que el admin/trabajador pueda
  // cambiar la suya propia desde aca (antes esta pantalla no tenia
  // ninguna opcion para eso). Misma logica exacta que usa Perfil.tsx
  // para el cliente: reautenticar con la contraseña actual y recien
  // ahi actualizar, todo sobre auth.currentUser (la sesion real de
  // quien esta conectado).
  const [modalPasswordAbierto, setModalPasswordAbierto] = useState(false);
  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [passwordConfirmar, setPasswordConfirmar] = useState("");
  const [cambiandoPassword, setCambiandoPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordExito, setPasswordExito] = useState(false);

  function cerrarModalPassword() {
    setModalPasswordAbierto(false);
    setPasswordActual("");
    setPasswordNueva("");
    setPasswordConfirmar("");
    setPasswordError("");
    setPasswordExito(false);
  }

  function passwordValida(password: string) {
    return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
  }

  async function cambiarPassword() {
    setPasswordError("");
    if (!passwordActual) {
      setPasswordError("Ingresa tu contraseña actual.");
      return;
    }
    if (!passwordValida(passwordNueva)) {
      setPasswordError("La nueva contraseña debe tener mínimo 8 caracteres, con letras y números.");
      return;
    }
    if (passwordNueva !== passwordConfirmar) {
      setPasswordError("Las contraseñas nuevas no coinciden.");
      return;
    }
    const usuario = auth?.currentUser;
    if (!auth || !usuario || !usuario.email) {
      setPasswordError("No se pudo identificar tu sesión. Vuelve a iniciar sesión e intenta de nuevo.");
      return;
    }

    setCambiandoPassword(true);
    try {
      const credencial = EmailAuthProvider.credential(usuario.email, passwordActual);
      await reauthenticateWithCredential(usuario, credencial);
      await updatePassword(usuario, passwordNueva);
      setPasswordExito(true);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      if (code.includes("wrong-password") || code.includes("invalid-credential")) {
        setPasswordError("La contraseña actual no es correcta.");
      } else if (code.includes("weak-password")) {
        setPasswordError("La nueva contraseña es muy débil.");
      } else if (code.includes("too-many-requests")) {
        setPasswordError("Demasiados intentos. Espera un momento y vuelve a intentar.");
      } else if (code.includes("requires-recent-login")) {
        setPasswordError("Tu sesión es muy antigua. Cierra sesión, vuelve a entrar e intenta de nuevo.");
      } else {
        setPasswordError("No se pudo cambiar la contraseña. Intenta de nuevo.");
      }
    } finally {
      setCambiandoPassword(false);
    }
  }

  const [limpieza, setLimpieza] = useState<LimpiezaEstado>({ fase: "idle" });
  // Fotos de la vieja pantalla de Evidencias: siguen referenciadas desde
  // el contrato, así que la limpieza de huérfanos NO las ve -- pero ya no
  // hay forma de mirarlas en la app, porque esa pantalla se retiró.
  const [evidencias, setEvidencias] = useState<
    | { fase: "idle" }
    | { fase: "contando" }
    | { fase: "contado"; contratos: number; archivos: number }
    | { fase: "borrando" }
    | { fase: "listo"; borradas: number }
    | { fase: "error"; mensaje: string }
  >({ fase: "idle" });

  async function llamarEvidencias(borrar: boolean) {
    if (!cloudFunctions) { setEvidencias({ fase: "error", mensaje: "Sin conexión." }); return; }
    setEvidencias({ fase: borrar ? "borrando" : "contando" });
    try {
      const fn = httpsCallable<
        { confirmar: boolean },
        { contratosConFotos: number; archivos: number; borradas: number }
      >(cloudFunctions, "contarEvidenciasHuerfanas");
      const { data } = await fn({ confirmar: borrar });
      setEvidencias(
        borrar
          ? { fase: "listo", borradas: data.borradas }
          : { fase: "contado", contratos: data.contratosConFotos, archivos: data.archivos }
      );
    } catch (error) {
      setEvidencias({ fase: "error", mensaje: mensajeDeError(error, "No se pudo consultar. Puede que falte desplegar la función en GitHub Actions.") });
    }
  }

  /**
   * Busca archivos en R2 que ya no están citados por ningún documento --
   * restos de subidas que se cortaron a la mitad. Primero SOLO revisa
   * (no borra nada): muestra cuántos son y cuánto espacio ocupan, y
   * recién con el segundo botón se borran de verdad.
   */
  async function revisarHuerfanos() {
    if (!cloudFunctions) { setLimpieza({ fase: "error", mensaje: "Sin conexión. Intenta de nuevo." }); return; }
    setLimpieza({ fase: "revisando" });
    try {
      const fn = httpsCallable<{ confirmar: boolean }, LimpiezaResultado>(cloudFunctions, "limpiarArchivosHuerfanos");
      const { data } = await fn({ confirmar: false });
      setLimpieza({ fase: "revisado", datos: data });
    } catch (error) {
      setLimpieza({ fase: "error", mensaje: mensajeDeError(error, "No se pudo revisar. Si acabas de actualizar la app, puede que falte desplegar la función en GitHub Actions.") });
    }
  }

  async function borrarHuerfanos(previo: LimpiezaResultado) {
    if (!cloudFunctions) { setLimpieza({ fase: "error", mensaje: "Sin conexión. Intenta de nuevo." }); return; }
    const confirmado = await confirmar({
      titulo: "¿Borrar los archivos sueltos?",
      mensaje: `Se borrarán ${previo.huerfanos} archivo${previo.huerfanos === 1 ? "" : "s"} y se recuperarán ${previo.mbHuerfanos} MB. No se puede deshacer.`,
      textoConfirmar: "Borrar",
      destructivo: true,
    });
    if (!confirmado) return;
    setLimpieza({ fase: "borrando", datos: previo });
    try {
      const fn = httpsCallable<{ confirmar: boolean }, LimpiezaResultado>(cloudFunctions, "limpiarArchivosHuerfanos");
      const { data } = await fn({ confirmar: true });
      setLimpieza({ fase: "listo", datos: data });
    } catch (error) {
      setLimpieza({ fase: "error", mensaje: mensajeDeError(error, "No se pudo completar la limpieza.") });
    }
  }

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
              // Antes 50% (círculo) -- se pidió cuadrado con bordes
              // redondeados, igual que el resto de la app. Mismo
              // radius que el BrandThumb de acá abajo.
              style={{ borderRadius: 22 }}
              onClick={() => setModalAvatarAbierto(true)}
              aria-label="Cambiar foto de perfil"
            >
              <BrandThumb name={nombre || rolInterno} avatarUrl={avatarUrl} size={76} radius={22} iconScale={0.72} />
              <span className="profile-avatar-camera-overlay" aria-hidden="true" style={{ borderRadius: 22 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
                  <circle cx="12" cy="13" r="3.4" />
                </svg>
              </span>
            </button>
          </div>
          {/* Ya no es editable a mano -- el nombre se resuelve solo
              (usePortalAuth trae el real de Firestore, o el respaldo
              conocido por correo si todavía no está guardado). Pedido
              explícito: sin lápiz ni prompt(), solo el nombre. */}
          <span className="admin-perfil-nombre">{nombre || rolInterno}</span>
          <div className="admin-perfil-email">{email}</div>
          <span className="profile-verified">
            <span className="profile-verified-mark" aria-hidden="true">
              <img src="/verified-check.svg" decoding="async" alt="" />
            </span>
            <span>Cuenta {rolInterno.toLowerCase()}</span>
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
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#64748B", marginTop: 2 }}>
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
              {espacio.status === "ready" && espacio.bytes !== undefined && (
                <div className="storage-usage-bar-wrap">
                  <div className="storage-usage-bar-track">
                    <div
                      className={`storage-usage-bar-fill${porcentajeUsado >= 90 ? " is-critical" : ""}`}
                      style={{ width: `${Math.min(100, Math.max(porcentajeUsado, porcentajeUsado > 0 ? 2 : 0))}%` }}
                    />
                  </div>
                  <div className="storage-usage-bar-caption">
                    <span>{formatoEspacio(espacio.bytes)} de 10 GB usados</span>
                    <strong className={porcentajeUsado >= 90 ? "is-critical" : ""}>
                      {porcentajeUsado.toFixed(2)}%
                    </strong>
                  </div>
                  {porcentajeUsado >= 90 && (
                    <div className="storage-usage-bar-warning">
                      Te estás quedando sin espacio -- considera borrar archivos que ya no uses.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="profile-metric-card" style={{ marginTop: 10 }}>
              <div style={{ padding: "4px 2px 0" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0B1220", marginBottom: 4 }}>
                  Archivos sin usar
                </div>
                <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.5, marginBottom: 12 }}>
                  Restos de subidas que se cortaron a la mitad: ocupan espacio pero ya no
                  aparecen en ninguna campaña, factura ni solicitud. Primero se revisan;
                  no se borra nada hasta que lo confirmes.
                </div>

                {limpieza.fase === "error" && (
                  <div style={{
                    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
                    color: "#DC2626", fontSize: 12, padding: "9px 12px", borderRadius: 12, marginBottom: 10, lineHeight: 1.5,
                  }}>
                    {limpieza.mensaje}
                  </div>
                )}

                {(limpieza.fase === "revisado" || limpieza.fase === "borrando" || limpieza.fase === "listo") && (
                  <div style={{
                    background: limpieza.datos.huerfanos === 0 ? "rgba(34,197,94,0.10)" : "rgba(8,119,255,0.08)",
                    border: `1px solid ${limpieza.datos.huerfanos === 0 ? "rgba(34,197,94,0.25)" : "rgba(8,119,255,0.2)"}`,
                    borderRadius: 12, padding: "10px 12px", marginBottom: 10, fontSize: 12, lineHeight: 1.6,
                    color: "#0B1220",
                  }}>
                    {limpieza.fase === "listo" ? (
                      <>Se borraron <strong>{limpieza.datos.borrados}</strong> archivo{limpieza.datos.borrados === 1 ? "" : "s"}. Espacio recuperado: <strong>{limpieza.datos.mbHuerfanos} MB</strong>.</>
                    ) : limpieza.datos.huerfanos === 0 ? (
                      <>Todo limpio — revisé {limpieza.datos.totalObjetos} archivos y ninguno sobra.</>
                    ) : (
                      <>
                        <strong>{limpieza.datos.huerfanos}</strong> archivo{limpieza.datos.huerfanos === 1 ? "" : "s"} sin usar,
                        de {limpieza.datos.totalObjetos} en total. Se recuperarían <strong>{limpieza.datos.mbHuerfanos} MB</strong>.
                        {limpieza.datos.muestra.length > 0 && (
                          <details style={{ marginTop: 6 }}>
                            <summary style={{ cursor: "pointer", fontSize: 11, color: "#0877FF", fontWeight: 600 }}>
                              Ver los más pesados
                            </summary>
                            <ul style={{ margin: "8px 0 0", paddingLeft: 16, fontSize: 11, color: "#64748B", lineHeight: 1.7 }}>
                              {limpieza.datos.muestra.slice(0, 10).map((h) => (
                                <li key={h.key} style={{ wordBreak: "break-all" }}>
                                  {h.key} — {formatoEspacio(h.bytes)}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingBottom: 4 }}>
                  <button
                    type="button"
                    onClick={revisarHuerfanos}
                    disabled={limpieza.fase === "revisando" || limpieza.fase === "borrando"}
                    style={{
                      flex: "1 1 auto", minWidth: 130, padding: "14px 14px", borderRadius: 12,
                      border: "1.5px solid #E5E7EB", background: "#fff", color: "#0B1220",
                      fontSize: 13, fontWeight: 700,
                      cursor: limpieza.fase === "revisando" || limpieza.fase === "borrando" ? "default" : "pointer",
                    }}
                  >
                    {limpieza.fase === "revisando" ? "Revisando…" : "Revisar"}
                  </button>

                  {(limpieza.fase === "revisado" || limpieza.fase === "borrando") && limpieza.datos.huerfanos > 0 && (
                    <button
                      type="button"
                      onClick={() => borrarHuerfanos(limpieza.datos)}
                      disabled={limpieza.fase === "borrando"}
                      style={{
                        flex: "1 1 auto", minWidth: 130, padding: "10px 14px", borderRadius: 12,
                        border: "none", background: limpieza.fase === "borrando" ? "#FCA5A5" : "#DC2626",
                        color: "#fff", fontSize: 13, fontWeight: 700,
                        cursor: limpieza.fase === "borrando" ? "default" : "pointer",
                      }}
                    >
                      {limpieza.fase === "borrando" ? "Borrando…" : `Borrar y liberar ${limpieza.datos.mbHuerfanos} MB`}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="profile-metric-card" style={{ marginTop: 10 }}>
              <div style={{ padding: "4px 2px 0" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0B1220", marginBottom: 4 }}>
                  Fotos de Evidencias (pantalla retirada)
                </div>
                <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.5, marginBottom: 12 }}>
                  Las fotos que se subían en la antigua pantalla de Evidencias siguen
                  ocupando espacio, pero ya no hay dónde verlas: ahora las fotos van
                  dentro del reporte mensual. La limpieza de arriba no las detecta
                  porque siguen enlazadas al contrato.
                </div>

                {evidencias.fase === "error" && (
                  <div style={{
                    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
                    color: "#DC2626", fontSize: 12, padding: "9px 12px", borderRadius: 12,
                    marginBottom: 10, lineHeight: 1.5,
                  }}>
                    {evidencias.mensaje}
                  </div>
                )}

                {evidencias.fase === "contado" && (
                  <div style={{
                    background: evidencias.archivos === 0 ? "rgba(34,197,94,0.10)" : "rgba(8,119,255,0.08)",
                    border: `1px solid ${evidencias.archivos === 0 ? "rgba(34,197,94,0.25)" : "rgba(8,119,255,0.2)"}`,
                    borderRadius: 12, padding: "10px 12px", marginBottom: 10,
                    fontSize: 12, lineHeight: 1.6, color: "#0B1220",
                  }}>
                    {evidencias.archivos === 0
                      ? "No quedó ninguna foto de la pantalla vieja."
                      : <>Hay <strong>{evidencias.archivos}</strong> foto{evidencias.archivos === 1 ? "" : "s"} en <strong>{evidencias.contratos}</strong> campaña{evidencias.contratos === 1 ? "" : "s"}.</>}
                  </div>
                )}

                {evidencias.fase === "listo" && (
                  <div style={{
                    background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.25)",
                    borderRadius: 12, padding: "10px 12px", marginBottom: 10, fontSize: 12, color: "#0B1220",
                  }}>
                    Se liberaron <strong>{evidencias.borradas}</strong> foto{evidencias.borradas === 1 ? "" : "s"}.
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingBottom: 4 }}>
                  <button
                    type="button"
                    onClick={() => llamarEvidencias(false)}
                    disabled={evidencias.fase === "contando" || evidencias.fase === "borrando"}
                    style={{
                      flex: "1 1 auto", minWidth: 130, padding: "14px", borderRadius: 12,
                      border: "1.5px solid #E5E7EB", background: "#fff", color: "#0B1220",
                      fontSize: 13, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    {evidencias.fase === "contando" ? "Contando…" : "Contar"}
                  </button>

                  {evidencias.fase === "contado" && evidencias.archivos > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        void (async () => {
                          const ok = await confirmar({
                            titulo: "¿Borrar estas fotos?",
                            mensaje: `Se borrarán ${evidencias.archivos} fotos de la pantalla retirada. No se puede deshacer.`,
                            textoConfirmar: "Borrar",
                            destructivo: true,
                          });
                          if (ok) await llamarEvidencias(true);
                        })();
                      }}
                      style={{
                        flex: "1 1 auto", minWidth: 130, padding: "14px", borderRadius: 12,
                        border: "none", background: "#DC2626", color: "#fff",
                        fontSize: 13, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      Borrar y liberar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="profile-section">
          <h2>Cuenta</h2>
          <div className="profile-card-list">
            <button type="button" className="profile-row clickable" onClick={() => setModalPasswordAbierto(true)}>
              <span className="profile-row-label">Cambiar contraseña</span>
            </button>
            <button type="button" className="profile-row danger clickable" onClick={() => logout()}>
              <span className="profile-row-label">Cerrar sesión</span>
            </button>
          </div>
        </section>
      </div>

      {modalPasswordAbierto && (
        <div
          // Mismo criterio que en Perfil.tsx: el modal solo se cierra
          // con "Cancelar" (o "Listo" tras exito), no al hacer clic
          // afuera -- para no perder sin querer lo ya escrito.
          style={{
            position: "fixed", inset: 0, background: "rgba(13,22,41,0.55)", zIndex: 500,
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#fff", borderRadius: "20px 20px 0 0", padding: "22px 20px",
              width: "100%", maxWidth: 480, boxShadow: "0 -8px 30px rgba(0,0,0,0.2)", boxSizing: "border-box",
            }}
          >
            {passwordExito ? (
              <>
                <div style={{ textAlign: "center", marginBottom: 6 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: "50%", background: "rgba(34,197,94,0.12)",
                    display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px",
                  }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0B1220", marginBottom: 6, textAlign: "center" }}>
                    Contraseña actualizada
                  </div>
                  <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5, marginBottom: 20, textAlign: "center" }}>
                    Tu contraseña se cambió correctamente. La próxima vez que inicies sesión, usa la nueva.
                  </div>
                </div>
                <button
                  onClick={cerrarModalPassword}
                  style={{
                    width: "100%", padding: "14px", background: "#0877FF", border: "none", borderRadius: 12,
                    color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
                  }}
                >
                  Listo
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#0B1220", marginBottom: 6 }}>
                  Cambiar contraseña
                </div>
                <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5, marginBottom: 16 }}>
                  Por seguridad, primero confirma tu contraseña actual.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: passwordError ? 10 : 18 }}>
                  <input
                    type="password"
                    value={passwordActual}
                    onChange={(e) => setPasswordActual(e.target.value)}
                    placeholder="Contraseña actual"
                    autoComplete="current-password"
                    disabled={cambiandoPassword}
                    style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 12, padding: "12px", boxSizing: "border-box", fontSize: 14 }}
                  />
                  <input
                    type="password"
                    value={passwordNueva}
                    onChange={(e) => setPasswordNueva(e.target.value)}
                    placeholder="Nueva contraseña (mín. 8, letras y números)"
                    autoComplete="new-password"
                    disabled={cambiandoPassword}
                    style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 12, padding: "12px", boxSizing: "border-box", fontSize: 14 }}
                  />
                  <input
                    type="password"
                    value={passwordConfirmar}
                    onChange={(e) => setPasswordConfirmar(e.target.value)}
                    placeholder="Confirmar nueva contraseña"
                    autoComplete="new-password"
                    disabled={cambiandoPassword}
                    style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 12, padding: "12px", boxSizing: "border-box", fontSize: 14 }}
                  />
                </div>
                {passwordError && (
                  <div style={{ color: "#DC2626", fontSize: 13, marginBottom: 14, lineHeight: 1.4 }}>{passwordError}</div>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={cerrarModalPassword}
                    disabled={cambiandoPassword}
                    style={{
                      flex: 1, padding: "14px", background: "#F3F4F6", border: "none", borderRadius: 12,
                      color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer",
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={cambiarPassword}
                    disabled={cambiandoPassword}
                    style={{
                      flex: 1, padding: "14px", background: "#0877FF", border: "none", borderRadius: 12,
                      color: "#fff", fontWeight: 700, fontSize: 14,
                      cursor: cambiandoPassword ? "not-allowed" : "pointer",
                    }}
                  >
                    {cambiandoPassword ? "Guardando…" : "Guardar contraseña"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
