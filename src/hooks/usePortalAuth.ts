import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { auth, db, onUserChange } from "../config/firebase";
import type { PortalUser } from "../types";

export type AuthState =
  | { status: "loading" }
  | { status: "out" }
  | { status: "error"; message: string }
  | { status: "in"; user: User; clienteId: string };

/**
 * Cuando el usuario inicia sesión, busca su documento en `portalUsers`
 * (creado por el dueño con el script) para saber a qué cliente
 * corresponde. Si el login es válido pero no existe ese vínculo, algo
 * está mal configurado — se lo decimos claro en vez de dejarlo a
 * medias.
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
        setState({ status: "in", user, clienteId: data.clienteId });
      } catch {
        setState({ status: "error", message: "No se pudo verificar tu cuenta. Intenta de nuevo." });
      }
    });
    return unsub;
  }, []);

  return state;
}

export const authReady = () => !!auth;
