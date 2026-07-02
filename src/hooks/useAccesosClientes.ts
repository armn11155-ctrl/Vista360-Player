import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../config/firebase";

export interface VisitaPantalla {
  count: number;
  lastVisit: number | null;
}

export interface AccesoCliente {
  clienteId: string;
  empresa: string;
  lastLogin: number | null;
  lastLoginCount: number;
  pantallasVisitadas: Record<string, VisitaPantalla>;
}

export type AccesosState =
  | { status: "loading" }
  | { status: "ready"; accesos: AccesoCliente[] }
  | { status: "error"; message: string };

/**
 * Lee los accesos de todos los clientes directo desde Firestore,
 * sin Cloud Functions ni Blaze. Solo lo usa la cuenta admin.
 * Cruza portalUsers (role=cliente) con clientes para obtener el
 * nombre de la empresa.
 */
export function useAccesosClientes(isAdmin: boolean): AccesosState {
  const [state, setState] = useState<AccesosState>({ status: "loading" });

  useEffect(() => {
    if (!isAdmin || !db) return;
    let cancelled = false;

    async function cargar() {
      try {
        // Traer todos los portalUsers con role=cliente
        const [portalSnap, clientesSnap] = await Promise.all([
          getDocs(query(collection(db!, "portalUsers"), where("role", "==", "cliente"))),
          getDocs(collection(db!, "clientes")),
        ]);

        // Mapa clienteId → nombre empresa
        const empresas = new Map<string, string>();
        clientesSnap.forEach((d) => {
          empresas.set(d.id, d.data().empresa ?? d.id);
        });

        const accesos: AccesoCliente[] = [];
        portalSnap.forEach((d) => {
          const data = d.data();
          const clienteId: string = data.clienteId ?? "";
          if (!clienteId) return;

          // Convertir los timestamps de pantallasVisitadas
          const pantallasRaw = data.pantallasVisitadas ?? {};
          const pantallasVisitadas: Record<string, VisitaPantalla> = {};
          for (const [pantalla, v] of Object.entries(pantallasRaw as Record<string, any>)) {
            pantallasVisitadas[pantalla] = {
              count: v.count ?? 0,
              lastVisit: v.lastVisit?.toMillis?.() ?? null,
            };
          }

          accesos.push({
            clienteId,
            empresa: empresas.get(clienteId) ?? clienteId,
            lastLogin: data.lastLogin?.toMillis?.() ?? null,
            lastLoginCount: data.lastLoginCount ?? 0,
            pantallasVisitadas,
          });
        });

        // Más reciente primero; los que nunca entraron al final
        accesos.sort((a, b) => (b.lastLogin ?? 0) - (a.lastLogin ?? 0));

        if (!cancelled) setState({ status: "ready", accesos });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "No se pudo cargar la analítica.",
          });
        }
      }
    }

    cargar();
    return () => { cancelled = true; };
  }, [isAdmin]);

  return state;
}
