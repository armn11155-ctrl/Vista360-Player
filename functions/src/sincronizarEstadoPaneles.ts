import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { esPanelExclusivo } from "./modalidadPanel.js";

if (getApps().length === 0) {
  initializeApp();
}

/** "Hoy" en Lima como "YYYY-MM-DD" -- Cloud Functions corre en UTC, así
 *  que cerca de la medianoche un new Date().toISOString() se corre de
 *  día entero. Mismo criterio que hoyEnLima() en notificacionesPush.ts
 *  y que hoyEnPeru() en el frontend (src/utils/fechas.ts). */
/** Día siguiente a una "YYYY-MM-DD": el soporte queda libre recién
 *  cuando termina la campaña que lo ocupa, no el mismo día. */
function sumarUnDia(fecha: string): string {
  const [a, m, d] = fecha.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return fecha;
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
}

function hoyEnLima(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

/**
 * Deja el campo `estado` de cada panel en sintonía con sus contratos.
 *
 * El problema que resuelve: `crearContrato` marca el panel como
 * "Ocupado" al crear una campaña, y `eliminarContrato` lo devuelve a
 * "Disponible" -- pero SOLO si el admin borra la campaña a mano. Cuando
 * una campaña simplemente llega a su fecha de fin no pasa nada, así que
 * el panel se quedaba "Ocupado" para siempre. Ahora que Cobertura les
 * muestra todo el inventario a los clientes, eso significa paneles que
 * se ven ocupados cuando en realidad llevan meses libres.
 *
 * Regla: un panel está "Ocupado" si tiene al menos un contrato vigente
 * hoy (inicio <= hoy <= fin, sin contar los borrados); si no, queda
 * "Disponible". Los paneles en "Mantenimiento" NO se tocan -- ese
 * estado lo pone el admin a mano y no depende de los contratos.
 *
 * Solo escribe los paneles cuyo estado cambia de verdad, para no gastar
 * escrituras ni disparar los listeners en vivo del frontend sin motivo.
 */
async function sincronizar(): Promise<{ revisados: number; actualizados: number; detalle: string[] }> {
  const db = getFirestore();
  const hoy = hoyEnLima();

  const [panelesSnap, contratosSnap] = await Promise.all([
    db.collection("paneles").get(),
    // Traer solo lo que puede estar vigente: fin >= hoy descarta de una
    // todo lo ya terminado, que es la mayor parte del historial.
    db.collection("contratos").where("fin", ">=", hoy).get(),
  ]);

  const panelesOcupados = new Set<string>();
  // Fecha en que termina la campaña vigente más larga de cada panel. Sirve
  // para decirle al cliente "disponible desde el ..." en una lona ocupada:
  // ese dato vive en contratos de OTROS clientes, que él no puede leer por
  // reglas de Firestore, así que se publica acá como un campo del panel --
  // solo la fecha, sin decir de quién es la campaña.
  const finVigentePorPanel = new Map<string, string>();

  contratosSnap.docs.forEach((doc) => {
    const c = doc.data();
    if (c.deleted) return;
    if (typeof c.inicio !== "string" || typeof c.fin !== "string") return;
    // fin >= hoy ya lo garantiza la consulta; falta confirmar que ya empezó.
    if (c.inicio > hoy) return;
    const ids: string[] =
      Array.isArray(c.panel_ids) && c.panel_ids.length > 0
        ? c.panel_ids
        : c.panel_id
        ? [c.panel_id]
        : [];
    ids.forEach((id) => {
      const key = String(id);
      panelesOcupados.add(key);
      const previo = finVigentePorPanel.get(key);
      if (!previo || c.fin > previo) finVigentePorPanel.set(key, c.fin);
    });
  });

  const detalle: string[] = [];
  const cambios: Promise<unknown>[] = [];

  panelesSnap.docs.forEach((doc) => {
    const datos = doc.data() ?? {};
    const actual = String(datos.estado ?? "");
    if (actual === "Mantenimiento") return;

    const ocupado = panelesOcupados.has(doc.id);
    const deberia = ocupado ? "Ocupado" : "Disponible";

    // "Libre desde" solo tiene sentido en soportes EXCLUSIVOS (lona,
    // mural): una pantalla LED admite otro anunciante desde ya, aunque
    // tenga campañas corriendo, así que ponerle fecha sería mentir.
    const finVigente = finVigentePorPanel.get(doc.id);
    const libreDesde =
      ocupado && esPanelExclusivo(datos) && finVigente ? sumarUnDia(finVigente) : null;

    const libreDesdeActual = datos.libreDesde ?? null;
    if (actual === deberia && libreDesdeActual === libreDesde) return;

    detalle.push(
      `${datos.nombre ?? doc.id}: ${actual || "(sin estado)"} -> ${deberia}` +
        (libreDesde ? ` (libre desde ${libreDesde})` : "")
    );
    cambios.push(doc.ref.set({ estado: deberia, libreDesde }, { merge: true }));
  });

  await Promise.all(cambios);

  return { revisados: panelesSnap.size, actualizados: cambios.length, detalle };
}

/** Se pidio que corriera sola, todos los dias a las 00:20 de Lima, apenas
 *  cambia el dia -- para que un panel cuya campana vencio ayer aparezca
 *  libre desde temprano, sin que nadie tenga que entrar a la app.
 *
 *  Antes esto era un "onSchedule" (Cloud Scheduler nativo de Google).
 *  Cloud Scheduler necesita que, la primera vez, alguien le otorgue
 *  permisos de IAM extra a un servicio interno de Google -- y la
 *  cuenta de servicio que usa el deploy automatico (GitHub Actions) no
 *  tiene autorizacion para otorgarse esos permisos a si misma en este
 *  proyecto, asi que el deploy de esta funcion fallaba siempre (ver
 *  historial de este archivo).
 *
 *  Ahora es una funcion HTTPS normal (como cualquier otra callable),
 *  protegida por un secret compartido -- y es un workflow de GitHub
 *  Actions con horario (cron) el que la llama una vez al dia, en vez
 *  de que Google Cloud la dispare solo. Mismo resultado (corre sola,
 *  sin que nadie toque nada), pero sin el problema de permisos: una
 *  funcion HTTPS con secret se despliega exactamente igual que
 *  cualquier otra de las ~50 funciones "normales" de este proyecto,
 *  que ya se sabe que funcionan bien con esta cuenta de servicio. */
export const sincronizarEstadoPaneles = onRequest(
  { secrets: ["CRON_SYNC_SECRET"] },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }
    if (req.get("x-cron-secret") !== process.env.CRON_SYNC_SECRET) {
      res.status(401).send("Unauthorized");
      return;
    }
    const resultado = await sincronizar();
    console.log(
      `Paneles revisados: ${resultado.revisados}, actualizados: ${resultado.actualizados}.`,
      resultado.detalle
    );
    res.status(200).json(resultado);
  }
);

/** La misma sincronización, pero a pedido del admin -- útil para
 *  corregir de una todos los paneles que quedaron "Ocupado" de antes,
 *  sin esperar a que corra la tarea de la madrugada. */
export const sincronizarEstadoPanelesAhora = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  if (!propio.exists || propio.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Solo la cuenta admin puede hacer esto.");
  }
  return sincronizar();
});
