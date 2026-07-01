import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getApps, initializeApp } from "firebase-admin/app";

if (getApps().length === 0) {
  initializeApp();
}

interface AccesoCliente {
  clienteId: string;
  empresa: string;
  lastLogin: number | null; // epoch ms, o null si nunca entró
  lastLoginCount: number;
}

/**
 * Devuelve, para cada cliente con cuenta en portalUsers, la última vez
 * que entró al Player — SOLO si quien llama tiene role:"admin" en su
 * propio documento de portalUsers. Usa el Admin SDK para leer todas las
 * cuentas de golpe (las reglas normales de Firestore no lo permitirían:
 * un admin-portal solo puede leer su propio documento, por diseño, para
 * no abrir una vía de acceso a datos de otros clientes desde el cliente).
 */
export const listarAccesosClientes = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  if (!propio.exists || propio.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Solo la cuenta admin puede ver esta información.");
  }

  const [portalUsersSnap, clientesSnap] = await Promise.all([
    db.collection("portalUsers").where("role", "==", "cliente").get(),
    db.collection("clientes").get(),
  ]);

  const empresaPorClienteId = new Map<string, string>();
  clientesSnap.forEach((doc) => {
    empresaPorClienteId.set(doc.id, doc.data().empresa ?? doc.id);
  });

  const accesos: AccesoCliente[] = [];
  portalUsersSnap.forEach((doc) => {
    const data = doc.data();
    const clienteId: string | undefined = data.clienteId;
    if (!clienteId) return;
    accesos.push({
      clienteId,
      empresa: empresaPorClienteId.get(clienteId) ?? clienteId,
      lastLogin: data.lastLogin?.toMillis?.() ?? null,
      lastLoginCount: data.lastLoginCount ?? 0,
    });
  });

  // Más reciente primero; los que nunca entraron (null) van al final.
  accesos.sort((a, b) => (b.lastLogin ?? 0) - (a.lastLogin ?? 0));

  return { accesos };
});
