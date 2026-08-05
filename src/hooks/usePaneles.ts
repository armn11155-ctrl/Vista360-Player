import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import type { Panel } from "../types";
import { panelesEnMemoria } from "./usePanelesDisponibles";

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

    // PRIMERO, LO QUE YA ESTÁ EN MEMORIA.
    //
    // La aplicación carga el inventario completo al arrancar (una sola
    // lectura, ver usePanelesDisponibles + agregadoPaneles.ts). Antes
    // este hook lo ignoraba y pedía a Firestore cada panel por
    // separado: en una sesión normal, con campañas en 8 paneles, eran 8
    // lecturas para datos que la app YA tenía delante.
    //
    // Ahora se sirve de ahí y solo se piden los que falten -- que en la
    // práctica es ninguno, salvo que el inventario aún no haya llegado
    // o el panel se haya creado hace un instante.
    const enMemoria = panelesEnMemoria();
    const yaTengo: Record<string, Panel> = {};
    const faltan: string[] = [];
    for (const id of uniqueIds) {
      const encontrado = enMemoria?.find((p) => p.id === id);
      if (encontrado) yaTengo[id] = encontrado;
      else faltan.push(id);
    }

    if (faltan.length === 0) {
      setPaneles(yaTengo);
      return;
    }
    // Se muestra ya lo que hay, sin esperar a los que faltan.
    if (Object.keys(yaTengo).length > 0) setPaneles(yaTengo);

    Promise.all(
      faltan.map(async (id) => {
        const snap = await getDoc(doc(db!, "paneles", id));
        return snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<Panel, "id">) } as Panel) : null;
      })
    )
      .then((results) => {
        if (cancelled) return;
        const map: Record<string, Panel> = { ...yaTengo };
        results.forEach((p) => {
          if (p) map[p.id] = p;
        });
        setPaneles(map);
      })
      // Sin este catch, una sola lectura fallida (sin conexión, permisos)
      // se convertía en un error de promesa no capturado y el mapa se
      // quedaba vacío en silencio -- los nombres de los paneles
      // desaparecían de la pantalla sin ningún aviso ni forma de saber
      // por qué. No se corta la pantalla por esto (el resto de la
      // campaña se sigue viendo bien), pero al menos queda registrado.
      .catch((error) => {
        if (cancelled) return;
        console.error("No se pudieron cargar los datos de los paneles.", error);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return paneles;
}
