import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) {
  initializeApp();
}

interface CrearContratoData {
  clienteId?: string;
  panelIds?: string[];
  nombre?: string;
  inicio?: string;
  fin?: string;
  monto?: number | string;
}

function limpiar(value?: string) {
  return value?.trim() ?? "";
}

function siguienteDia(fechaStr: string): string {
  const d = new Date(`${fechaStr}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Crea una campaña (contrato) nueva -- antes esto se hacía con un
 * addDoc directo desde el cliente (NuevaCampana.tsx), que dejó de
 * funcionar al agregar el campo panel_ids (probablemente las reglas
 * de Firestore de "contratos" no lo reconocen y rechazan el write).
 * Mismo patrón que el resto de acciones sensibles del admin: pasa por
 * Admin SDK, no depende de las reglas de Firestore -- así este tipo de
 * problema no vuelve a pasar cada vez que se agregue un campo nuevo.
 *
 * Puede recibir uno o varios paneles (panelIds) -- si son 2+, es una
 * campaña multi-panel: panel_id se guarda igual (el primero elegido,
 * por compatibilidad con todo el código que todavía lee un solo
 * panel), panel_ids es la lista completa. La validación de traslape de
 * fechas corre para CADA panel elegido.
 */
export const crearContrato = onCall<CrearContratoData>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  if (!propio.exists || propio.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Solo la cuenta admin puede crear campañas.");
  }

  const clienteId = limpiar(request.data.clienteId);
  const panelIds = Array.from(
    new Set((Array.isArray(request.data.panelIds) ? request.data.panelIds : []).map((id) => limpiar(id)).filter(Boolean))
  );
  const nombre = limpiar(request.data.nombre);
  const inicio = limpiar(request.data.inicio);
  const fin = limpiar(request.data.fin);
  const monto = Number(request.data.monto);

  if (!clienteId) {
    throw new HttpsError("invalid-argument", "Falta el cliente.");
  }
  if (panelIds.length === 0) {
    throw new HttpsError("invalid-argument", "Elige al menos un panel.");
  }
  if (!inicio || !fin) {
    throw new HttpsError("invalid-argument", "Pon fecha de inicio y de fin.");
  }
  if (fin < inicio) {
    throw new HttpsError("invalid-argument", "La fecha de fin no puede ser antes que la de inicio.");
  }
  if (!Number.isFinite(monto) || monto < 0) {
    throw new HttpsError("invalid-argument", "Pon un monto válido.");
  }

  // Un mismo cliente no puede tener dos campañas activas a la vez en
  // el mismo panel -- se revisa para CADA panel elegido si este
  // cliente ya tiene otro contrato en ese panel (como panel principal
  // o como parte de una campaña multi-panel) cuyas fechas se crucen
  // con las que se está por crear. Otro cliente distinto SÍ puede
  // tener una campaña activa en el mismo panel al mismo tiempo -- el
  // bloqueo es por cliente+panel, no por panel solo.
  const contratosClienteSnap = await db.collection("contratos").where("cliente_id", "==", clienteId).get();
  const contratosCliente = contratosClienteSnap.docs.map(
    (d) => d.data() as { panel_id?: string; panel_ids?: string[]; inicio?: string; fin?: string; deleted?: boolean }
  );

  for (const panelId of panelIds) {
    const cruces = contratosCliente.filter((c) => {
      if (c.deleted || !c.inicio || !c.fin) return false;
      if (!(c.inicio <= fin && inicio <= c.fin)) return false;
      const idsDeC = c.panel_ids && c.panel_ids.length > 0 ? c.panel_ids : c.panel_id ? [c.panel_id] : [];
      return idsDeC.includes(panelId);
    });
    if (cruces.length > 0) {
      const panelSnap = await db.doc(`paneles/${panelId}`).get();
      const nombrePanel = panelSnap.exists ? String(panelSnap.data()?.nombre || "ese panel") : "ese panel";
      const finMasLejano = cruces.reduce((max, c) => (c.fin! > max ? c.fin! : max), cruces[0].fin!);
      throw new HttpsError(
        "failed-precondition",
        `Este cliente ya tiene una campaña programada en ${nombrePanel} hasta el ${finMasLejano}. No puede tener dos campañas activas a la vez en el mismo panel -- puedes programar esta a partir del ${siguienteDia(finMasLejano)}.`
      );
    }
  }

  const contratoRef = db.collection("contratos").doc();
  await contratoRef.set({
    panel_id: panelIds[0],
    panel_ids: panelIds,
    cliente_id: clienteId,
    ...(nombre ? { nombre } : {}),
    inicio,
    fin,
    monto,
    pagado: false,
    fotos_campania: [],
    createdAt: FieldValue.serverTimestamp(),
  });

  // Marcar TODOS los paneles elegidos como Ocupado (mismo
  // comportamiento que en el ERP, ahora para cada uno).
  await Promise.all(
    panelIds.map((panelId) => db.doc(`paneles/${panelId}`).set({ estado: "Ocupado" }, { merge: true }))
  );

  return { ok: true, contratoId: contratoRef.id };
});
