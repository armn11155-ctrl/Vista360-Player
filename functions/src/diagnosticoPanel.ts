import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { modalidadDePanel, cuposPanel } from "./modalidadPanel.js";
import { estadoDesdeActivos, hoyEnLima } from "./estadoPaneles.js";
import { esGerente, esTrabajador } from "./rolesInternos.js";

if (getApps().length === 0) {
  initializeApp();
}

interface DiagnosticoPanelData {
  panelId?: string;
}

/**
 * Muestra, para UN panel puntual, exactamente por qué el sistema decide
 * que está Ocupado o Disponible -- se agregó después de varias rondas
 * donde "sigue en blanco" no se podía diagnosticar a ciegas sin ver los
 * datos reales de Firestore. Devuelve el tipo/modalidad guardados, la
 * modalidad EFECTIVA que calcula modalidadDePanel() (que puede diferir
 * de la guardada), el cupo resultante, y la lista completa de contratos
 * que referencian este panel con sus fechas -- para ver de un vistazo
 * si el "no se ve Ocupado" es porque el panel no cuenta como exclusivo,
 * o porque el contrato que lo ocupa no está llegando a la cuenta por
 * algún motivo (fechas, campo distinto, etc.).
 */
export const diagnosticoPanel = onCall<DiagnosticoPanelData>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  const rol = propio.data()?.role;
  if (!propio.exists || !(esGerente(rol) || esTrabajador(rol))) {
    throw new HttpsError("permission-denied", "Solo el equipo interno puede ver esto.");
  }

  const panelId = String(request.data?.panelId ?? "").trim();
  if (!panelId) {
    throw new HttpsError("invalid-argument", "Falta el panel.");
  }

  try {
    return await construirDiagnostico(db, panelId);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    // "internal" (el código por defecto de un throw sin HttpsError) se
    // traduce SIEMPRE al mensaje genérico "Algo falló de nuestro lado"
    // en el frontend (ver mensajeDeError.ts), sin importar qué texto
    // traiga -- por eso acá se usa "failed-precondition" a propósito,
    // un código que esa tabla no traduce, para que el detalle REAL del
    // error llegue a la pantalla en vez de quedar escondido.
    console.error(`diagnosticoPanel: fallo real para panelId=${panelId}`, error);
    const detalle = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new HttpsError("failed-precondition", `Fallo real del diagnóstico: ${detalle}`);
  }
});

async function construirDiagnostico(db: FirebaseFirestore.Firestore, panelId: string) {
  const panelSnap = await db.doc(`paneles/${panelId}`).get();
  if (!panelSnap.exists) {
    throw new HttpsError("not-found", "No se encontró ese panel.");
  }
  const datos = panelSnap.data() ?? {};

  const hoy = hoyEnLima();
  const [porLista, porUnico] = await Promise.all([
    db.collection("contratos").where("panel_ids", "array-contains", panelId).get(),
    db.collection("contratos").where("panel_id", "==", panelId).get(),
  ]);
  const vistos = new Map<string, FirebaseFirestore.DocumentData & { id: string }>();
  [...porLista.docs, ...porUnico.docs].forEach((d) => vistos.set(d.id, { id: d.id, ...d.data() }));

  const clienteIds = Array.from(
    new Set([...vistos.values()].map((c) => String(c.cliente_id ?? "")).filter(Boolean))
  );
  const clientesSnap = clienteIds.length
    ? await db.getAll(...clienteIds.map((id) => db.doc(`clientes/${id}`)))
    : [];
  const nombreCliente = new Map<string, string>();
  clientesSnap.forEach((snap) => {
    if (snap.exists) nombreCliente.set(snap.id, String(snap.data()?.empresa ?? "Cliente"));
  });

  const contratos = [...vistos.values()]
    .map((c) => ({
      id: c.id,
      clienteId: String(c.cliente_id ?? ""),
      clienteNombre: nombreCliente.get(String(c.cliente_id ?? "")) ?? "(sin cliente)",
      inicio: typeof c.inicio === "string" ? c.inicio : null,
      fin: typeof c.fin === "string" ? c.fin : null,
      deleted: Boolean(c.deleted),
      panelIdsCrudo: c.panel_ids ?? null,
      panelIdCrudo: c.panel_id ?? null,
      vigenteHoy:
        !c.deleted &&
        typeof c.inicio === "string" &&
        typeof c.fin === "string" &&
        c.inicio <= hoy &&
        hoy <= c.fin,
    }))
    .sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));

  const cupos = cuposPanel(datos);
  const finsActivos = contratos.filter((c) => c.vigenteHoy).map((c) => c.fin as string);
  const { ocupado, libreDesde } = estadoDesdeActivos(cupos, finsActivos);
  const estadoGuardado = String(datos.estado ?? "");

  return {
    panelId,
    hoy,
    nombre: String(datos.nombre ?? ""),
    tipoGuardado: String(datos.tipo ?? ""),
    modalidadGuardada: datos.modalidad ?? null,
    modalidadEfectiva: modalidadDePanel(datos),
    cupos: Number.isFinite(cupos) ? cupos : null,
    estadoGuardadoActual: estadoGuardado || "(vacío)",
    libreDesdeGuardado: datos.libreDesde ?? null,
    estadoQueDeberiaSer:
      estadoGuardado === "Mantenimiento" ? "Mantenimiento (manual, no se toca)" : ocupado ? "Ocupado" : "Disponible",
    libreDesdeCalculado: libreDesde,
    contratosEncontrados: contratos,
  };
}
