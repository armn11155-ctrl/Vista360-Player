import { useCallback, useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import BackChevron from "../BackChevron";
import { cloudFunctions } from "../../config/firebase";
import { fechaCorta } from "../../utils/fechas";
import { mensajeDeError } from "../../utils/errores";
import { useDialogos } from "../DialogosProvider";

interface Props {
  onBack: () => void;
}

/** Lo que devuelve listarPapelera por cada objeto en _papelera/ (ver
 *  functions/src/papeleraR2.ts). `clave` viaja acá pero nunca se
 *  muestra como campo editable -- solo la usa el botón Restaurar. */
interface ItemPapelera {
  clave: string;
  rutaOriginal: string;
  tipo: string;
  clienteId: string | null;
  eliminadoEl: string | null;
  diasRestantes: number;
  tamanoBytes: number | null;
  restaurable: boolean;
  requiereRecuperacionAdicional: boolean;
  mensajeAdicional: string | null;
}

type Estado =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: ItemPapelera[] };

function formatoBytes(bytes: number | null): string {
  if (bytes === null || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Nombre de archivo, sin toda la ruta de carpetas -- lo que sí importa
 *  ver de un vistazo, sin obligar a leer una ruta larga completa. */
function nombreLegible(rutaOriginal: string): string {
  const partes = rutaOriginal.split("/");
  return partes[partes.length - 1] || rutaOriginal;
}

export default function Papelera({ onBack }: Props) {
  const { confirmar, avisar } = useDialogos();
  const [estado, setEstado] = useState<Estado>({ status: "loading" });
  const [restaurandoClave, setRestaurandoClave] = useState<string | null>(null);
  const [restauradas, setRestauradas] = useState<Set<string>>(new Set());
  const [accionError, setAccionError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!cloudFunctions) {
      setEstado({ status: "error", message: "Firebase Functions no está configurado." });
      return;
    }
    setEstado((actual) => (actual.status === "ready" ? actual : { status: "loading" }));
    try {
      const fn = httpsCallable<Record<string, never>, { items: ItemPapelera[] }>(cloudFunctions, "listarPapelera");
      const res = await fn({});
      setEstado({ status: "ready", items: res.data.items });
    } catch (err) {
      setEstado({
        status: "error",
        message: mensajeDeError(err, "No se pudo cargar la papelera. Revisa tu conexión e intenta de nuevo."),
      });
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function restaurar(item: ItemPapelera) {
    if (!cloudFunctions) {
      setAccionError("Firebase Functions no está configurado.");
      return;
    }
    const ok = await confirmar({
      titulo: "¿Restaurar este archivo?",
      mensaje: `Se restaurará "${nombreLegible(item.rutaOriginal)}" a su ubicación original.`,
      textoConfirmar: "Restaurar",
    });
    if (!ok) return;

    setAccionError(null);
    setRestaurandoClave(item.clave);
    try {
      const fn = httpsCallable<
        { clave: string },
        { ok: boolean; requiereRecuperacionAdicional: boolean; mensajeAdicional: string | null }
      >(cloudFunctions, "restaurarDePapelera");
      const res = await fn({ clave: item.clave });
      setRestauradas((actual) => new Set(actual).add(item.clave));
      if (res.data.requiereRecuperacionAdicional && res.data.mensajeAdicional) {
        await avisar({
          titulo: "Archivo restaurado",
          mensaje: `${res.data.mensajeAdicional} El archivo volvió a R2, pero el registro relacionado en la app ya no existe o apunta a otro lado -- puede que necesites recrearlo a mano.`,
        });
      } else {
        await avisar({ titulo: "Archivo restaurado", mensaje: "El archivo volvió a su ubicación original." });
      }
    } catch (err) {
      setAccionError(
        mensajeDeError(err, "No se pudo restaurar el archivo. Si acaba de actualizarse la app, puede que falte desplegar la función en GitHub Actions.")
      );
    } finally {
      setRestaurandoClave(null);
    }
  }

  const items = estado.status === "ready" ? estado.items : [];

  return (
    <div className="admin-tool-screen solicitudes-screen">
      <div className="detail-header">
        <div className="back-btn" onClick={onBack}>
          <BackChevron />
        </div>
        <div className="simple-title">Papelera</div>
        <div style={{ width: 32 }} />
      </div>

      <div className="content-area solicitudes-area">
        <div className="card" style={{ background: "rgba(8,119,255,0.12)" }}>
          <div style={{ fontSize: 12, color: "#1D4ED8", lineHeight: 1.5 }}>
            Archivos borrados en los últimos 30 días (facturas, fotos de campaña, avatares y
            reportes). Pasado ese plazo, Cloudflare los borra solo. Solo tú puedes ver esta
            pantalla.
          </div>
        </div>

        {accionError && (
          <div
            style={{
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
              color: "#DC2626", fontSize: 12, lineHeight: 1.5, padding: "10px 14px",
              borderRadius: 12, margin: "10px 0", display: "flex", alignItems: "flex-start", gap: 10,
            }}
          >
            <span style={{ flex: 1 }}>{accionError}</span>
            <button
              type="button"
              onClick={() => setAccionError(null)}
              aria-label="Cerrar aviso"
              style={{ background: "none", border: "none", color: "#DC2626", fontSize: 16, lineHeight: 1, cursor: "pointer", padding: 0, flexShrink: 0 }}
            >
              ×
            </button>
          </div>
        )}

        {estado.status === "loading" && (
          <div className="premium-loading-panel" role="status">
            <span className="premium-loading-orbit" aria-hidden="true" />
            <div><strong>Revisando la papelera</strong><small>Consultando lo que se borró en R2</small></div>
          </div>
        )}
        {estado.status === "error" && (
          <div className="state-sub" style={{ marginTop: 24, textAlign: "center", color: "var(--red)" }}>
            {estado.message}
          </div>
        )}

        {estado.status === "ready" && items.length === 0 && (
          <div className="premium-empty-panel">
            <span className="premium-empty-check" aria-hidden="true">✓</span>
            <div><strong>Papelera vacía</strong><small>No hay archivos borrados en los últimos 30 días.</small></div>
          </div>
        )}

        {items.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {items.map((item) => {
              const yaRestaurado = restauradas.has(item.clave);
              const restaurando = restaurandoClave === item.clave;
              return (
                <div className="card solicitudes-card" key={item.clave}>
                  <div className="request-priority-row">
                    <span className="request-status-chip">{item.tipo}</span>
                    <small>{item.diasRestantes} {item.diasRestantes === 1 ? "día" : "días"} restantes</small>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 3, wordBreak: "break-word" }}>
                    {nombreLegible(item.rutaOriginal)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2, wordBreak: "break-all" }}>
                    {item.rutaOriginal}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
                    Borrado el {fechaCorta(item.eliminadoEl ?? undefined)} · {formatoBytes(item.tamanoBytes)}
                    {item.clienteId ? ` · Cliente: ${item.clienteId}` : ""}
                  </div>

                  {item.requiereRecuperacionAdicional && (
                    <div
                      style={{
                        background: "rgba(8,119,255,0.08)", border: "1px solid rgba(8,119,255,0.24)",
                        color: "#0B4E9D", fontSize: 12, lineHeight: 1.5, padding: "8px 12px",
                        borderRadius: 10, marginBottom: 12,
                      }}
                    >
                      {item.mensajeAdicional}
                    </div>
                  )}

                  {!item.restaurable && (
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      Esta ruta no pertenece a una carpeta conocida de la app -- no se puede restaurar desde acá.
                    </div>
                  )}

                  {item.restaurable && (
                    <button
                      type="button"
                      onClick={() => void restaurar(item)}
                      disabled={restaurando || yaRestaurado}
                      style={{
                        width: "100%", background: yaRestaurado ? "rgba(22,163,74,0.14)" : "var(--accent)",
                        border: "none", borderRadius: 12, padding: "10px 12px",
                        color: yaRestaurado ? "#16A34A" : "#fff", fontSize: 12, fontWeight: 700,
                        cursor: restaurando || yaRestaurado ? "not-allowed" : "pointer",
                      }}
                    >
                      {yaRestaurado ? "✓ Restaurado" : restaurando ? "Restaurando…" : "Restaurar"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
