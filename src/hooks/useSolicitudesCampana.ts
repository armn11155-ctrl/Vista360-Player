import { useEffect, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../config/firebase";
import type { SolicitudCampana } from "../types";

export type SolicitudesCampanaState =
  | { status: "loading" }
  | { status: "ready"; solicitudes: SolicitudCampana[] }
  | { status: "error"; message: string };

/** Solo lo usa la cuenta admin (Modo Administrador) — lee TODAS las
 *  solicitudes de campaña de todos los clientes, para gestionarlas
 *  sin salir de Vista360 Player. */
export function useSolicitudesCampana(isAdmin: boolean): SolicitudesCampanaState {
  const [state, setState] = useState<SolicitudesCampanaState>({ status: "loading" });

  useEffect(() => {
    if (!db || !isAdmin) return;
    const q = query(collection(db, "solicitudesCampana"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const solicitudes = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<SolicitudCampana, "id">) }))
          .sort((a, b) => {
            const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return tb - ta;
          });
        setState({ status: "ready", solicitudes });
      },
      (err) => setState({ status: "error", message: err.message })
    );
    return unsub;
  }, [isAdmin]);

  return state;
}
