import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { regenerarResumenCliente } from "./agregadoCliente.js";
import { exigirId, idOpcional } from "./identificadores.js";
import { exigirRitmo } from "./limitador.js";

if (getApps().length === 0) {
  initializeApp();
}

interface CrearSolicitudCampanaData {
  clienteId?: string;
  nombre?: string;
  ciudades?: string[];
  comentarios?: string;
  fechaInicioDeseada?: string;
  fechaFinDeseada?: string | null;
  mesesDeseados?: number;
  panelSolicitadoId?: string;
  panelSolicitadoNombre?: string;
}

const MAX_NOMBRE = 80;
const MAX_COMENTARIOS = 1000;
const MAX_CIUDADES = 20;

function limpiar(value?: string) {
  return value?.trim() ?? "";
}

/**
 * Crea una solicitud de campaña (pedido de campaña nueva o de
 * renovación) -- antes esto era un addDoc directo desde el cliente
 * (NuevaCampana.tsx y MisCampanas.tsx), y dejó de funcionar cuando esas
 * dos pantallas empezaron a mandar más campos (ciudades,
 * fechaFinDeseada, etc.) que las reglas de Firestore de
 * "solicitudesCampana" no tenían contempladas -- el resultado era un
 * "permission-denied" ("No tienes permiso para hacer esto.") en
 * cualquier botón que mandara una solicitud, sin que el código en sí
 * tuviera ningún error.
 *
 * Es exactamente el mismo problema que ya se había resuelto para
 * crearContrato (ver su comentario) y por lo que eliminarSolicitudCampana
 * ya pasa por Admin SDK: las reglas de esta colección son estrictas por
 * diseño (es historial/auditoría), así que cada vez que el formulario
 * agrega un campo nuevo, el write directo se puede romper de nuevo. Con
 * esto pasa a depender del código del servidor, no de mantener las
 * reglas sincronizadas a mano con el formulario.
 *
 * Permisos: cualquier cuenta autenticada puede pedir una campaña, pero
 * una cuenta "cliente" SOLO puede pedirla para su propio clienteId (no
 * para otro) -- el admin sí puede pedirla para cualquier cliente, porque
 * usa esta misma pantalla cuando está "viendo como" un cliente.
 */
export const crearSolicitudCampana = onCall<CrearSolicitudCampanaData>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  // Techo de peticiones por minuto: ver limitador.ts.
  exigirRitmo(uid, "crearSolicitudCampana", 20);

  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  if (!propio.exists) {
    throw new HttpsError("permission-denied", "Tu cuenta no está vinculada a ningún cliente.");
  }
  const datosPropio = propio.data() ?? {};
  const rol = datosPropio.role === "admin" ? "admin" : "cliente";

  const clienteId = exigirId(request.data?.clienteId, "clienteId");
  if (!clienteId) {
    throw new HttpsError("invalid-argument", "Falta el cliente.");
  }
  if (rol === "cliente" && clienteId !== datosPropio.clienteId) {
    throw new HttpsError("permission-denied", "No puedes pedir una campaña para otra cuenta.");
  }

  const nombre = limpiar(request.data?.nombre);
  if (!nombre) {
    throw new HttpsError("invalid-argument", "Ponle un nombre a tu campaña.");
  }
  if (nombre.length > MAX_NOMBRE) {
    throw new HttpsError("invalid-argument", `El nombre no puede pasar de ${MAX_NOMBRE} caracteres.`);
  }

  const comentarios = limpiar(request.data?.comentarios);
  if (comentarios.length > MAX_COMENTARIOS) {
    throw new HttpsError("invalid-argument", `Los comentarios no pueden pasar de ${MAX_COMENTARIOS} caracteres.`);
  }

  const ciudades = (Array.isArray(request.data?.ciudades) ? request.data.ciudades : [])
    .map((c) => limpiar(c))
    .filter(Boolean)
    .slice(0, MAX_CIUDADES);

  const fechaInicioDeseada = limpiar(request.data?.fechaInicioDeseada);
  if (!fechaInicioDeseada) {
    throw new HttpsError("invalid-argument", "Falta la fecha de inicio deseada.");
  }
  const fechaFinDeseada = request.data?.fechaFinDeseada ? limpiar(request.data.fechaFinDeseada) : null;

  const mesesDeseados = request.data?.mesesDeseados;
  const panelSolicitadoId = idOpcional(request.data?.panelSolicitadoId, "panelSolicitadoId");
  const panelSolicitadoNombre = limpiar(request.data?.panelSolicitadoNombre);

  // Evitar duplicados: se pidió específicamente esto porque un cliente
  // puede tocar "Enviar solicitud" varias veces el mismo día (doble
  // clic, la app se ve lenta y vuelve a intentar, o simplemente no se
  // acuerda que ya la mandó hace un rato) y terminaba con 2 o 3
  // solicitudes idénticas en la bandeja del admin. Si ya existe una
  // solicitud de HOY (hora de Perú), del mismo cliente, todavía
  // "Pendiente" (el admin no la tocó) y para lo mismo -- mismo panel si
  // la solicitud es sobre un panel puntual (renovación/disponibilidad),
  // o mismo nombre si es una solicitud general -- no se crea una nueva:
  // se devuelve la que ya existe, y el cliente ve el mismo "solicitud
  // enviada" de siempre (no un error), solo que con el aviso de que ya
  // la habían mandado. Desde su lado no cambia nada malo: su pedido YA
  // está en camino, no hacía falta mandarlo de nuevo.
  const hoyPeru = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const pendientesSnap = await db
    .collection("solicitudesCampana")
    .where("cliente_id", "==", clienteId)
    .where("estado", "==", "Pendiente")
    .get();
  const duplicada = pendientesSnap.docs.find((d) => {
    const data = d.data();
    const creada = data.createdAt?.toDate ? data.createdAt.toDate() : null;
    if (!creada) return false;
    const fechaCreada = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(creada);
    if (fechaCreada !== hoyPeru) return false;
    if (panelSolicitadoId) return data.panelSolicitadoId === panelSolicitadoId;
    return String(data.nombre ?? "") === nombre;
  });
  if (duplicada) {
    return { ok: true, id: duplicada.id, yaExistia: true };
  }

  const ref = await db.collection("solicitudesCampana").add({
    cliente_id: clienteId,
    nombre,
    ciudades,
    comentarios,
    fechaInicioDeseada,
    fechaFinDeseada,
    estado: "Pendiente",
    createdAt: FieldValue.serverTimestamp(),
    ...(typeof mesesDeseados === "number" && Number.isFinite(mesesDeseados) ? { mesesDeseados } : {}),
    ...(panelSolicitadoId ? { panelSolicitadoId, panelSolicitadoNombre: panelSolicitadoNombre || panelSolicitadoId } : {}),
  });

  // El resumen del cliente incluye sus solicitudes.
  await regenerarResumenCliente(db, clienteId);
  return { ok: true, id: ref.id, yaExistia: false };
});
