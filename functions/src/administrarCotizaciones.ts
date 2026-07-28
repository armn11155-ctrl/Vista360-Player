import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) initializeApp();

type Accion = "listar" | "crear" | "estado" | "eliminar";
type Estado = "Borrador" | "Enviada" | "Aprobada" | "Rechazada" | "Vencida";

interface Data {
  accion?: Accion;
  id?: string;
  estado?: Estado;
  nombre?: string;
  clienteId?: string;
  clienteNombre?: string;
  panelId?: string;
  panelNombre?: string;
  panelCiudad?: string;
  inicio?: string;
  fin?: string;
  duracionMeses?: number;
  monto?: number;
  moneda?: "PEN" | "USD";
  incluyeIgv?: boolean;
  vigenciaDias?: number;
  condiciones?: string;
  observaciones?: string;
}

const ESTADOS = new Set<Estado>(["Borrador", "Enviada", "Aprobada", "Rechazada", "Vencida"]);
const fechaValida = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const limpiar = (value: unknown, max = 240) => String(value ?? "").trim().slice(0, max);

export const administrarCotizaciones = onCall<Data>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

  const db = getFirestore();
  const usuario = await db.doc(`portalUsers/${uid}`).get();
  if (!usuario.exists || usuario.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Solo la cuenta admin puede administrar cotizaciones.");
  }

  const accion = request.data.accion;
  if (accion === "listar") {
    const snap = await db.collection("cotizaciones").orderBy("createdAt", "desc").limit(200).get();
    return {
      cotizaciones: snap.docs.map((doc) => {
        const data = doc.data();
        const { createdAt: _createdAt, updatedAt: _updatedAt, ...serializable } = data;
        return {
          id: doc.id,
          ...serializable,
          createdAtMs: data.createdAt?.toMillis?.() ?? 0,
        };
      }),
    };
  }

  if (accion === "crear") {
    const nombre = limpiar(request.data.nombre, 100);
    const clienteId = limpiar(request.data.clienteId, 120);
    const clienteNombre = limpiar(request.data.clienteNombre, 160);
    const panelId = limpiar(request.data.panelId, 120);
    const panelNombre = limpiar(request.data.panelNombre, 160);
    const panelCiudad = limpiar(request.data.panelCiudad, 100);
    const inicio = limpiar(request.data.inicio, 10);
    const fin = limpiar(request.data.fin, 10);
    const duracionMeses = Number(request.data.duracionMeses);
    const monto = Number(request.data.monto);
    const moneda = request.data.moneda === "USD" ? "USD" : "PEN";
    const vigenciaDias = Number(request.data.vigenciaDias ?? 15);

    if (!clienteId || !clienteNombre || !panelId || !panelNombre) {
      throw new HttpsError("invalid-argument", "Completa el cliente y panel.");
    }
    if (!fechaValida(inicio) || !fechaValida(fin) || fin < inicio) {
      throw new HttpsError("invalid-argument", "El periodo de campaña no es válido.");
    }
    if (!Number.isInteger(duracionMeses) || duracionMeses < 1 || duracionMeses > 60) {
      throw new HttpsError("invalid-argument", "La duración debe estar entre 1 y 60 meses.");
    }
    if (!Number.isFinite(monto) || monto <= 0 || monto > 100_000_000) {
      throw new HttpsError("invalid-argument", "Ingresa un monto válido.");
    }
    if (!Number.isInteger(vigenciaDias) || vigenciaDias < 1 || vigenciaDias > 90) {
      throw new HttpsError("invalid-argument", "La vigencia debe estar entre 1 y 90 días.");
    }

    const exoneradaIgv = panelCiudad.toLocaleLowerCase("es").includes("guanajuato");
    const titulo = nombre || `Propuesta comercial · ${panelNombre}`;
    const metaRef = db.doc("cotizacionesMeta/secuencia");
    const cotizacionRef = db.collection("cotizaciones").doc();
    let numero = "";
    await db.runTransaction(async (tx) => {
      const meta = await tx.get(metaRef);
      const siguiente = Number(meta.data()?.valor ?? 0) + 1;
      numero = `COT-${new Date().getFullYear()}-${String(siguiente).padStart(4, "0")}`;
      tx.set(metaRef, { valor: siguiente, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.set(cotizacionRef, {
        numero,
        nombre: titulo,
        clienteId,
        clienteNombre,
        panelId,
        panelNombre,
        ...(panelCiudad ? { panelCiudad } : {}),
        inicio,
        fin,
        duracionMeses,
        monto,
        moneda,
        incluyeIgv: exoneradaIgv ? false : Boolean(request.data.incluyeIgv),
        exoneradaIgv,
        vigenciaDias,
        condiciones: limpiar(request.data.condiciones, 600),
        observaciones: limpiar(request.data.observaciones, 800),
        estado: "Borrador",
        createdBy: uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return { ok: true, id: cotizacionRef.id, numero };
  }

  const id = limpiar(request.data.id, 120);
  if (!id) throw new HttpsError("invalid-argument", "Falta la cotización.");
  const ref = db.doc(`cotizaciones/${id}`);

  if (accion === "estado") {
    const estado = request.data.estado;
    if (!estado || !ESTADOS.has(estado)) {
      throw new HttpsError("invalid-argument", "Estado inválido.");
    }
    await ref.set({ estado, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true };
  }
  if (accion === "eliminar") {
    await ref.delete();
    return { ok: true };
  }

  throw new HttpsError("invalid-argument", "Acción inválida.");
});
