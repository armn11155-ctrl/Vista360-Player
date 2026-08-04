import type { Firestore } from "firebase-admin/firestore";
import { cuposPanel } from "./modalidadPanel.js";

/** "Hoy" en Lima como "YYYY-MM-DD" -- mismo criterio que hoyEnLima() en
 *  notificacionesPush.ts y que hoyEnPeru() en el frontend (src/utils/fechas.ts). */
export function hoyEnLima(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

/** Día siguiente a una "YYYY-MM-DD" -- el soporte queda libre recién
 *  cuando termina la campaña que lo ocupa, no el mismo día. */
export function sumarUnDia(fecha: string): string {
  const [a, m, d] = fecha.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return fecha;
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * A partir de las fechas de fin de los contratos VIGENTES HOY en un
 * panel y su cupo (1 en lona/mural/paradero, 2 en unipolar, Infinity en
 * LED), decide si el panel está lleno y desde cuándo se libera un cupo.
 *
 * Con cupo > 1 (unipolar) el próximo cupo se libera cuando termina el
 * MÁS CERCANO de los contratos activos que sobran para volver a estar
 * bajo el cupo -- no el que termina más lejos (ese era el bug binario
 * de antes: con 2 caras ocupadas, alcanza con que UNA se libere).
 */
export function estadoDesdeActivos(
  cupos: number,
  finsActivos: string[]
): { ocupado: boolean; libreDesde: string | null } {
  if (!Number.isFinite(cupos)) return { ocupado: false, libreDesde: null };
  if (finsActivos.length < cupos) return { ocupado: false, libreDesde: null };
  const ordenados = [...finsActivos].sort();
  const idx = finsActivos.length - cupos;
  return { ocupado: true, libreDesde: sumarUnDia(ordenados[idx]) };
}

/**
 * Recalcula y escribe el estado (Ocupado/Disponible) de un puñado de
 * paneles puntuales, según sus contratos vigentes HOY comparados con su
 * cupo -- pensada para llamarse justo después de crear, editar o borrar
 * UN contrato (crearContrato.ts, actualizarContrato.ts,
 * eliminarContrato.ts), para que Cobertura muestre el cambio al toque
 * en vez de esperar a la tarea diaria.
 *
 * El barrido de TODO el inventario, una vez al día, vive en
 * sincronizarEstadoPaneles.ts -- hace lo mismo (mismas funciones de
 * arriba) pero en bloque, por eficiencia. Si se cambia la regla de
 * ocupación, cambiarla en estadoDesdeActivos()/cuposPanel() nomás: las
 * dos rutas la comparten y no pueden quedar desalineadas entre sí.
 *
 * Nunca toca un panel en Mantenimiento (eso lo pone el admin a mano).
 */
export async function recalcularEstadoPaneles(db: Firestore, panelIds: string[]): Promise<void> {
  const hoy = hoyEnLima();
  const idsUnicos = Array.from(new Set(panelIds.filter(Boolean)));
  await Promise.all(
    idsUnicos.map(async (panelId) => {
      try {
        const panelRef = db.doc(`paneles/${panelId}`);
        const panelSnap = await panelRef.get();
        if (!panelSnap.exists) return;
        const datosPanel = panelSnap.data() ?? {};
        if (String(datosPanel.estado ?? "") === "Mantenimiento") return;

        const [porLista, porUnico] = await Promise.all([
          db.collection("contratos").where("panel_ids", "array-contains", panelId).get(),
          db.collection("contratos").where("panel_id", "==", panelId).get(),
        ]);
        const vistos = new Map<string, FirebaseFirestore.DocumentData>();
        [...porLista.docs, ...porUnico.docs].forEach((d) => vistos.set(d.id, d.data()));

        const finsActivos: string[] = [];
        vistos.forEach((c) => {
          if (c.deleted) return;
          if (typeof c.inicio !== "string" || typeof c.fin !== "string") return;
          if (!(c.inicio <= hoy && hoy <= c.fin)) return;
          finsActivos.push(c.fin);
        });

        const cupos = cuposPanel(datosPanel);
        const { ocupado, libreDesde } = estadoDesdeActivos(cupos, finsActivos);
        const deberia = ocupado ? "Ocupado" : "Disponible";

        const actual = String(datosPanel.estado ?? "");
        const libreDesdeActual = datosPanel.libreDesde ?? null;
        if (actual === deberia && libreDesdeActual === libreDesde) return;

        await panelRef.set({ estado: deberia, libreDesde }, { merge: true });
      } catch (err) {
        console.error(`No se pudo recalcular el estado del panel ${panelId}.`, err);
      }
    })
  );
}
