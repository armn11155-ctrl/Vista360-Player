import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, query } from "firebase/firestore";
import { db } from "../config/firebase";

export interface InvitacionPortal {
  id: string;
  uid?: string;
  email: string;
  clienteId: string | null;
  clienteNombre: string;
  avatarKey?: string;
  avatarUrl?: string;
  esAdmin?: boolean;
  link: string;
  archived?: boolean;
  createdAt?: { toDate: () => Date } | null;
  archivedAt?: { toDate: () => Date } | null;
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
    // Sin orderBy("createdAt") a propósito: Firestore excluye de un
    // orderBy cualquier documento al que le falte ese campo -- varios
    // usuarios creados antes (o por el script viejo) no lo tienen, y
    // con orderBy simplemente desaparecían de la lista sin ningún
    // error. Se trae todo y se ordena acá mismo, tratando "sin fecha"
    // como lo más viejo (va al final) en vez de excluirlo.
    const q = query(collection(db, "invitacionesPortal"), limit(200));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const invitaciones = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<InvitacionPortal, "id">) }))
          .sort((a, b) => (b.createdAt?.toDate?.().getTime() ?? 0) - (a.createdAt?.toDate?.().getTime() ?? 0));
        setState({ status: "ready", invitaciones });
      },
      (err) => setState({ status: "error", message: err.message })
    );
    return unsub;
  }, [isAdmin]);

  return state;
}
