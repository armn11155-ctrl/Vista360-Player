import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../config/firebase";

export interface InvitacionPortal {
  id: string;
  uid: string;
  email: string;
  clienteId: string | null;
  clienteNombre: string;
  avatarKey?: string;
  avatarUrl?: string;
  esAdmin: boolean;
  link: string;
  createdAt?: { toDate: () => Date } | null;
}

export type InvitacionesState =
  | { status: "loading" }
  | { status: "ready"; invitaciones: InvitacionPortal[] }
  | { status: "error"; message: string };

/** Solo lo usa el admin — lista los últimos links de invitación
 *  generados (crear-acceso-cliente.mjs), para poder copiarlos y
 *  mandarlos a mano si hace falta, sin depender solo del correo
 *  automático. */
export function useInvitaciones(isAdmin: boolean): InvitacionesState {
  const [state, setState] = useState<InvitacionesState>({ status: "loading" });

  useEffect(() => {
    if (!db || !isAdmin) return;
    const q = query(collection(db, "invitacionesPortal"), orderBy("createdAt", "desc"), limit(30));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const invitaciones = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<InvitacionPortal, "id">) }));
        setState({ status: "ready", invitaciones });
      },
      (err) => setState({ status: "error", message: err.message })
    );
    return unsub;
  }, [isAdmin]);

  return state;
}
