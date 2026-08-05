import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { cuposPanel } from "./modalidadPanel.js";
import { estadoDesdeActivos, hoyEnLima } from "./estadoPaneles.js";
import { regenerarAgregadoPaneles } from "./agregadoPaneles.js";
import { regenerarAgregadoClientes } from "./agregadoClientes.js";
import { regenerarResumenesDeTodos } from "./agregadoCliente.js";

if (getApps().length === 0) {
  initializeApp();
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

  // Fechas de fin de cada contrato vigente HOY, agrupadas por panel --
  // no un booleano ni "la más lejana": estadoDesdeActivos() necesita
  // TODAS para calcular bien cuándo se libera un cupo en soportes con
  // más de uno (unipolar, 2 caras).
  const finsActivosPorPanel = new Map<string, string[]>();

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
      const lista = finsActivosPorPanel.get(key) ?? [];
      lista.push(c.fin);
      finsActivosPorPanel.set(key, lista);
    });
  });

  const detalle: string[] = [];
  const cambios: Promise<unknown>[] = [];

  panelesSnap.docs.forEach((doc) => {
    const datos = doc.data() ?? {};
    const actual = String(datos.estado ?? "");
    if (actual === "Mantenimiento") return;

    const cupos = cuposPanel(datos);
    const finsActivos = finsActivosPorPanel.get(doc.id) ?? [];
    const { ocupado, libreDesde } = estadoDesdeActivos(cupos, finsActivos);
    const deberia = ocupado ? "Ocupado" : "Disponible";

    const libreDesdeActual = datos.libreDesde ?? null;
    if (actual === deberia && libreDesdeActual === libreDesde) return;

    detalle.push(
      `${datos.nombre ?? doc.id}: ${actual || "(sin estado)"} -> ${deberia}` +
        (libreDesde ? ` (libre desde ${libreDesde})` : "")
    );
    cambios.push(doc.ref.set({ estado: deberia, libreDesde }, { merge: true }));
  });

  await Promise.all(cambios);

  // Esta función escribe los estados directamente, sin pasar por
  // recalcularEstadoPaneles, así que refresca el agregado por su cuenta
  // (ver agregadoPaneles.ts). Se hace siempre, aunque no haya cambiado
  // nada: es una sola escritura al día y garantiza que el agregado no se
  // quede viejo si alguna vez se desincronizó por otra vía.
  await regenerarAgregadoPaneles(db);
  // OBLIGATORIO A DIARIO, no solo al tocar un contrato: "campana
  // activa" depende de la FECHA DE HOY. Una programada pasa a activa
  // sin que nadie escriba nada, y sin esto el contador del selector
  // se quedaria congelado hasta el siguiente cambio manual.
  await regenerarAgregadoClientes(db);
  // Red de seguridad: reconstruye el resumen de TODOS los clientes por
  // si alguna escritura no lo hubiera hecho. Los contratos solo se
  // escriben desde Cloud Functions, asi que no deberia hacer falta --
  // pero un resumen desfasado se veria en la pantalla principal del
  // cliente, y eso no se puede dejar a la confianza.
  await regenerarResumenesDeTodos(db);

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
  // "invoker: public" -- es la UNICA funcion onRequest de este
  // proyecto (todas las demas son onCall, que Firebase hace publicas
  // solas). Sin esto, la funcion se despliega bien pero Google Cloud
  // la deja privada por defecto (solo invocable con credenciales de
  // Google) -- cualquier llamada de afuera sin eso, como el curl del
  // cron de GitHub Actions, se encuentra con un 403 ANTES de que el
  // codigo de aca llegue a correr (por eso el 403 no viene con
  // ningun mensaje propio: no es este código el que lo devuelve). La
  // seguridad real la sigue dando el secret (CRON_SYNC_SECRET) que se
  // revisa abajo, no el que la funcion sea publica.
  { secrets: ["CRON_SYNC_SECRET"], invoker: "public" },
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
