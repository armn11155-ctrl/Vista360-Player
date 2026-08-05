import type { Firestore } from "firebase-admin/firestore";
import { cuposPanel } from "./modalidadPanel.js";
import { estadoDesdeActivos, hoyEnLima, sumarUnDia } from "./reglasOcupacion.js";
import { regenerarAgregadoPaneles } from "./agregadoPaneles.js";

// Las reglas puras de ocupación se mudaron a reglasOcupacion.ts (ver el
// comentario grande de ese archivo: se importan desde los tests del
// frontend, y arrastrar hasta allá el `import ... firebase-admin` de
// este archivo rompía el build de despliegue). Se siguen re-exportando
// desde acá para que los 8 archivos que ya las importaban de
// "./estadoPaneles.js" no tengan que cambiar.
export { estadoDesdeActivos, hoyEnLima, sumarUnDia };

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

  // Punto único donde se refresca la copia que lee Cobertura. Se pone
  // acá y no en cada función que toca paneles porque por acá pasan
  // TODAS: crear y editar un panel, y crear, editar o borrar una
  // campaña (que cambia el estado del panel). Un solo sitio que
  // recordar en vez de cinco.
  //
  // Las dos excepciones, que lo llaman por su cuenta, son eliminar un
  // panel (ya no hay estado que recalcular) y la sincronización diaria
  // (escribe los estados directamente, sin pasar por acá).
  await regenerarAgregadoPaneles(db);
}
