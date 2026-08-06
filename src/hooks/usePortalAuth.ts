import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db, logout, onUserChange } from "../config/firebase";
import type { PortalRole, PortalUser } from "../types";
import { nombreConocidoPorEmail } from "../utils/nombresConocidos";
import { publicarAvatarPropio } from "./useAvatarPropio";

// El rol se vuelve a validar al regresar a la app, pero no mas de una vez
// cada cinco minutos. Mantener un listener sobre portalUsers hacia que cada
// contador de acceso o pantalla (que vive en el mismo documento) se cobrara
// tambien como una lectura nueva, aunque el rol no hubiera cambiado.
const VIGENCIA_VERIFICACION_MS = 5 * 60_000;

export type AuthState =
  | { status: "loading" }
  | { status: "out" }
  | { status: "error"; message: string }
  | { status: "in"; user: User; role: PortalRole; clienteId: string | null; nombre: string | null };

/**
 * Cuando el usuario inicia sesión, busca su documento en `portalUsers`
 * (creado por el dueño con el script) para saber su rol:
 *   - "cliente": tiene un clienteId fijo, solo ve lo suyo.
 *   - "admin": clienteId es null — elige a cuál cliente ver desde un
 *     selector dentro de la app (ver AdminClientPicker).
 */
export function usePortalAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelado = false;
    let usuarioActual: User | null = null;
    let verificadoEn = 0;
    let verificacionEnCurso: Promise<void> | null = null;

    const verificar = (user: User, forzar: boolean): Promise<void> => {
      if (!db) return Promise.reject(new Error("Firebase no configurado."));
      if (!forzar && Date.now() - verificadoEn < VIGENCIA_VERIFICACION_MS) {
        return Promise.resolve();
      }
      if (verificacionEnCurso) return verificacionEnCurso;

      verificacionEnCurso = getDoc(doc(db, "portalUsers", user.uid))
        .then(async (snap) => {
          if (cancelado || usuarioActual?.uid !== user.uid) return;
          if (!snap.exists()) {
            setState({
              status: "error",
              message:
                "Tu cuenta existe pero no está vinculada a ningún cliente. Pide al administrador que la configure.",
            });
            return;
          }
          const data = snap.data() as Omit<PortalUser, "uid">;
          if (data.archived) {
            await logout();
            if (!cancelado) {
              setState({
                status: "error",
                message: "Tu usuario está archivado. Pide al administrador que lo restaure.",
              });
            }
            return;
          }

          publicarAvatarPropio(user.uid, String(data.avatarUrl ?? ""));
          const role: PortalRole = data.role ?? "cliente";
          const clienteId = role === "cliente" ? data.clienteId ?? null : null;
          const nombre = data.nombre ?? nombreConocidoPorEmail(user.email) ?? null;
          verificadoEn = Date.now();
          setState((actual) => {
            if (
              actual.status === "in" &&
              actual.user.uid === user.uid &&
              actual.role === role &&
              actual.clienteId === clienteId &&
              actual.nombre === nombre
            ) {
              return actual;
            }
            return { status: "in", user, role, clienteId, nombre };
          });
        })
        .finally(() => {
          verificacionEnCurso = null;
        });
      return verificacionEnCurso;
    };

    const unsub = onUserChange(async (user) => {
      usuarioActual = user;
      if (!user) {
        verificadoEn = 0;
        setState({ status: "out" });
        return;
      }
      if (!db) {
        setState({ status: "error", message: "Firebase no configurado." });
        return;
      }
      try {
        await verificar(user, true);
      } catch {
        if (!cancelado) {
          setState({ status: "error", message: "No se pudo verificar tu cuenta. Intenta de nuevo." });
        }
      }
    });

    // Si el dueño archiva o cambia el rol mientras la PWA está en segundo
    // plano, se aplica al volver. Las Functions y las reglas siguen
    // comprobando permisos en cada operación sensible durante todo el tiempo.
    const revalidarAlVolver = () => {
      if (document.visibilityState === "visible" && usuarioActual) {
        void verificar(usuarioActual, false).catch(() => {
          /* una pérdida momentánea de red no expulsa a quien ya estaba dentro */
        });
      }
    };
    document.addEventListener("visibilitychange", revalidarAlVolver);
    window.addEventListener("focus", revalidarAlVolver);

    return () => {
      cancelado = true;
      document.removeEventListener("visibilitychange", revalidarAlVolver);
      window.removeEventListener("focus", revalidarAlVolver);
      unsub();
    };
  }, []);

  return state;
}
