import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { auth, db, logout, onUserChange } from "../config/firebase";
import type { PortalRole, PortalUser } from "../types";

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
    const unsub = onUserChange(async (user) => {
      if (!user) {
        setState({ status: "out" });
        return;
      }
      if (!db) {
        setState({ status: "error", message: "Firebase no configurado." });
        return;
      }
      try {
        const snap = await getDoc(doc(db, "portalUsers", user.uid));
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
          setState({
            status: "error",
            message: "Tu usuario está archivado. Pide al administrador que lo restaure.",
          });
          return;
        }
        const role: PortalRole = data.role ?? "cliente";
        setState({
          status: "in",
          user,
          role,
          clienteId: role === "cliente" ? data.clienteId ?? null : null,
          nombre: data.nombre ?? null,
        });
      } catch {
        setState({ status: "error", message: "No se pudo verificar tu cuenta. Intenta de nuevo." });
      }
    });
    return unsub;
  }, []);

  return state;
}

export const authReady = () => !!auth;
