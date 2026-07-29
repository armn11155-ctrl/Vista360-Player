import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import type { User } from "firebase/auth";
import { auth, db, logout, onUserChange } from "../config/firebase";
import type { PortalRole, PortalUser } from "../types";

// Cuentas creadas a mano antes de que existiera el campo "nombre" en
// portalUsers (la del Gerente original, armn.101@hotmail.com) nunca lo
// tuvieron, así que en toda la app se caía al nombre del rol ("Gerente")
// en vez de al nombre real -- se ve en Mi perfil y en el sidebar. Hay una
// Cloud Function (actualizarNombrePropio) que lo corrige escribiendo en
// Firestore, pero eso depende de que esté desplegada; mientras tanto (o
// si nunca se despliega) esto asegura que el nombre correcto se vea
// igual, sin depender del servidor. En cuanto Firestore sí tenga el
// campo "nombre" (por la función, o editado a mano desde Mi perfil), ese
// valor real gana siempre -- esto es solo el último fallback.
const NOMBRES_CONOCIDOS: Record<string, string> = {
  "armn.101@hotmail.com": "Alan Martínez",
};

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
    // Suscripción al documento del usuario. Vive fuera del callback para
    // poder cortarla cuando cambia la sesión (o al desmontar): si no, al
    // cerrar sesión seguiría escuchando un documento que ya no se puede
    // leer, y Firestore lanzaría un error de permisos.
    let desuscribirDoc: (() => void) | undefined;

    const unsub = onUserChange(async (user) => {
      if (!user) {
        desuscribirDoc?.();
        desuscribirDoc = undefined;
        setState({ status: "out" });
        return;
      }
      if (!db) {
        setState({ status: "error", message: "Firebase no configurado." });
        return;
      }
      // onSnapshot y no getDoc: antes el rol se leía UNA sola vez al
      // iniciar sesión, así que archivar a alguien o cambiarle el rol no
      // tenía ningún efecto hasta que esa persona recargara la app -- y
      // en una PWA que se deja abierta, eso puede ser días. El servidor
      // igual la frenaba (las Cloud Functions revalidan), pero seguía
      // viendo pantallas que ya no le correspondían. Ahora el cambio se
      // aplica en el momento.
      desuscribirDoc?.();
      desuscribirDoc = onSnapshot(
        doc(db, "portalUsers", user.uid),
        async (snap) => {
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
            nombre: data.nombre ?? NOMBRES_CONOCIDOS[(user.email ?? "").trim().toLowerCase()] ?? null,
          });
        },
        () => {
          setState({ status: "error", message: "No se pudo verificar tu cuenta. Intenta de nuevo." });
        }
      );
    });
    return () => {
      desuscribirDoc?.();
      unsub();
    };
  }, []);

  return state;
}

export const authReady = () => !!auth;
