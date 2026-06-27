import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import type { Panel } from "../types";

/**
 * Trae los paneles referenciados por una lista de panel_id, una sola
 * vez cada uno (no hace falta tiempo real para nombre/ubicación, que
 * cambia poco). Devuelve un mapa id → Panel para consulta rápida.
 */
export function usePaneles(panelIds: string[]): Record<string, Panel> {
  const [paneles, setPaneles] = useState<Record<string, Panel>>({});
  const key = panelIds.slice().sort().join(",");

  useEffect(() => {
    if (!db || panelIds.length === 0) return;
    let cancelled = false;
    const uniqueIds = Array.from(new Set(panelIds));
    Promise.all(
      uniqueIds.map(async (id) => {
        const snap = await getDoc(doc(db!, "paneles", id));
        return snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<Panel, "id">) } as Panel) : null;
      })
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, Panel> = {};
      results.forEach((p) => {
        if (p) map[p.id] = p;
      });
      setPaneles(map);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return paneles;
}
