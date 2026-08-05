import type { Firestore } from "firebase-admin/firestore";

/**
 * Resumen POR CLIENTE: todas sus campañas en UN documento.
 *
 * POR QUÉ EXISTE. Una sesión de cliente costaba 3 lecturas fijas + una
 * por campaña vigente + una por solicitud. Con esto, las campañas pasan
 * a costar 1 sola lectura tenga el cliente dos o doscientas. De 8 a 5.
 *
 * ENTRAN TAMBIÉN LAS SOLICITUDES. Antes no: el navegador del admin las
 * actualizaba directamente y el resumen se habría quedado desfasado al
 * marcar una como revisada. Ese camino se cerró
 * (actualizarEstadoSolicitud), así que ahora TODA escritura sobre las
 * dos colecciones pasa por una Cloud Function y no hay forma de que un
 * cambio se nos escape.
 *
 * ─────────────────────────────────────────────────────────────────────
 * LA DECISIÓN IMPORTANTE: SE GUARDA TODO, NO SOLO LO VIGENTE.
 *
 * La versión obvia sería guardar "las campañas vigentes". Sería un error
 * grave: "vigente" depende de la FECHA DE HOY. Una campaña que termina
 * esta noche deja de serlo a medianoche sin que nadie escriba nada, y el
 * resumen mostraría como activa una campaña terminada -- en la pantalla
 * principal del cliente, con sus fechas delante.
 *
 * Guardando TODAS las campañas, el documento no depende de la fecha: es
 * un reflejo exacto de lo que hay en la colección. El navegador filtra
 * por fecha igual que hoy. Solo puede quedar desactualizado si alguien
 * ESCRIBE y no se regenera -- y eso sí está cubierto: se llama desde
 * cada función que toca contratos o solicitudes, hay un barrido diario,
 * y un test comprueba que ninguna se olvide.
 * ─────────────────────────────────────────────────────────────────────
 *
 * AISLAMIENTO. Un documento por cliente, con su id en la ruta, y la
 * regla de Firestore solo deja leer el propio. Un cliente no puede
 * llegar al de otro ni cambiando la URL.
 */

export function rutaResumen(clienteId: string): string {
  return `agregados/cliente-${clienteId}`;
}

/** Cuántas solicitudes resueltas se guardan. Las notificaciones solo
 *  miran las de 14 días, así que con las más recientes sobra. Las
 *  pendientes van SIEMPRE, sin tope. */
export const SOLICITUDES_RECIENTES = 100;

/** Aviso: por encima de esto el documento se acerca al límite de 1 MB. */
const AVISO_CONTRATOS = 400;

function ordenDescendente(a: unknown, b: unknown): number {
  return String(b ?? "").localeCompare(String(a ?? ""));
}

/**
 * Reconstruye el resumen de UN cliente leyendo sus documentos.
 *
 * Nunca lanza: si falla, el frontend lo detecta y cae a leer las
 * colecciones directamente. Más caro, pero correcto. Crear una campaña
 * no puede fallar porque el resumen no se pudo escribir.
 */
export async function regenerarResumenCliente(db: Firestore, clienteId: string): Promise<void> {
  if (!clienteId) return;
  try {
    const [contratosSnap, solicitudesSnap] = await Promise.all([
      db.collection("contratos").where("cliente_id", "==", clienteId).get(),
      db.collection("solicitudesCampana").where("cliente_id", "==", clienteId).get(),
    ]);

    const contratos = contratosSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => !(c as { deleted?: boolean }).deleted)
      .sort((a, b) => ordenDescendente((a as { inicio?: string }).inicio, (b as { inicio?: string }).inicio));

    if (contratos.length > AVISO_CONTRATOS) {
      console.warn(
        `El resumen del cliente ${clienteId} ya tiene ${contratos.length} campañas. ` +
          "Acercándose al límite de 1 MB por documento: conviene partirlo."
      );
    }

    // Las PENDIENTES van todas (son trabajo sin atender). De las
    // resueltas bastan las más recientes: las notificaciones solo miran
    // las de los últimos 14 días. El corte es por número, no por fecha,
    // para que el documento no dependa del calendario.
    const solicitudesTodas = solicitudesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const pendientes = solicitudesTodas.filter((s) => (s as { estado?: string }).estado === "Pendiente");
    const resueltas = solicitudesTodas
      .filter((s) => (s as { estado?: string }).estado !== "Pendiente")
      .sort((a, b) => {
        const fa = (a as { estadoActualizadoEn?: { toMillis?: () => number } }).estadoActualizadoEn;
        const fb = (b as { estadoActualizadoEn?: { toMillis?: () => number } }).estadoActualizadoEn;
        return (fb?.toMillis?.() ?? 0) - (fa?.toMillis?.() ?? 0);
      })
      .slice(0, SOLICITUDES_RECIENTES);

    await db.doc(rutaResumen(clienteId)).set({
      contratos,
      solicitudes: [...pendientes, ...resueltas],
      totalContratos: contratos.length,
      actualizadoEn: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`No se pudo regenerar el resumen del cliente ${clienteId}.`, error);
  }
}

/** Regenera los resúmenes de varios clientes. Se usa en el barrido
 *  diario, que es la red de seguridad por si alguna escritura no lo
 *  hubiera hecho. */
export async function regenerarResumenesDeTodos(db: Firestore): Promise<void> {
  try {
    const snap = await db.collection("clientes").get();
    // De 20 en 20 para no abrir cientos de consultas a la vez.
    const ids = snap.docs.map((d) => d.id);
    for (let i = 0; i < ids.length; i += 20) {
      await Promise.all(ids.slice(i, i + 20).map((id) => regenerarResumenCliente(db, id)));
    }
  } catch (error) {
    console.error("No se pudieron regenerar los resúmenes de clientes.", error);
  }
}
