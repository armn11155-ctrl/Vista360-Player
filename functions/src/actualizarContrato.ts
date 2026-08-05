import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { cuposPanel } from "./modalidadPanel.js";
import { recalcularEstadoPaneles } from "./estadoPaneles.js";
import { esPersonalInterno } from "./rolesInternos.js";

if (getApps().length === 0) initializeApp();

interface ActualizarContratoData {
  contratoId?: string;
  nombre?: string;
  inicio?: string;
  fin?: string;
}

function limpiar(value?: string) {
  return value?.trim() ?? "";
}

function nombreConMayuscula(value: string) {
  return value.charAt(0).toLocaleUpperCase("es-PE") + value.slice(1);
}

function siguienteDia(fechaStr: string): string {
  const d = new Date(`${fechaStr}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export const actualizarContrato = onCall<ActualizarContratoData>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

  const db = getFirestore();
  const usuario = await db.doc(`portalUsers/${uid}`).get();
  if (!usuario.exists || !esPersonalInterno(usuario.data()?.role)) {
    throw new HttpsError("permission-denied", "Solo el equipo interno puede editar campañas.");
  }

  const contratoId = limpiar(request.data.contratoId);
  const nombre = nombreConMayuscula(limpiar(request.data.nombre));
  const inicio = limpiar(request.data.inicio);
  const fin = limpiar(request.data.fin);

  if (!contratoId) throw new HttpsError("invalid-argument", "Falta la campaña.");
  if (!nombre) throw new HttpsError("invalid-argument", "Escribe el nombre de la campaña.");
  if (!inicio || !fin) throw new HttpsError("invalid-argument", "Completa las dos fechas.");
  if (fin < inicio) throw new HttpsError("invalid-argument", "La fecha de fin no puede ser anterior al inicio.");

  const ref = db.doc(`contratos/${contratoId}`);

  // Igual que crearContrato.ts: esta funcion dejaba cambiar las fechas
  // de una campaña sin volver a revisar la regla de "un mismo cliente
  // no puede tener dos campañas activas a la vez en el mismo panel" --
  // se podia editar una campaña para que sus fechas nuevas se crucen
  // con otra del mismo cliente en el mismo panel, algo que crearContrato
  // nunca hubiera dejado crear de cero. Ahora corre la misma revision
  // (y dentro de una transaccion, por la misma razon de concurrencia:
  // dos ediciones casi al mismo tiempo no deben poder colarse las dos
  // a la vez con fechas que se crucen entre si).
  let panelIdsAfectados: string[] = [];

  await db.runTransaction(async (tx) => {
    const actual = await tx.get(ref);
    if (!actual.exists) throw new HttpsError("not-found", "No se encontró esa campaña.");
    const contratoActual = actual.data() ?? {};
    const panelIds: string[] = Array.isArray(contratoActual.panel_ids) && contratoActual.panel_ids.length > 0
      ? contratoActual.panel_ids
      : (contratoActual.panel_id ? [contratoActual.panel_id] : []);
    const clienteId = String(contratoActual.cliente_id ?? "");
    panelIdsAfectados = panelIds;

    if (clienteId && panelIds.length > 0) {
      type ContratoFila = {
        cliente_id?: string;
        panel_id?: string;
        panel_ids?: string[];
        inicio?: string;
        fin?: string;
        deleted?: boolean;
      };

      // Misma regla que al crear (ver crearContrato.ts): en pantallas LED
      // solo se revisa contra el propio cliente, porque rotan anuncios;
      // en soportes con cupo limitado (lona/mural/paradero: 1, unipolar:
      // 2) se revisa contra CUALQUIER cliente, y se bloquea recién cuando
      // ya hay tantas campañas cruzadas como cupos tiene el soporte.
      // Mismo motivo que en crearContrato.ts (ver el comentario largo
      // allá): esto era `tx.get(db.collection("contratos"))`, o sea
      // leer TODO el historial de contratos cada vez que se edita una
      // campaña. Una cuenta que solo crece con los años hasta volverse
      // lenta y cara sin que nadie haya tocado nada. Ahora se traen
      // solo los contratos de ESTOS paneles, con las dos consultas que
      // cubren el formato nuevo (panel_ids) y el viejo (panel_id).
      const relevantes = new Map<string, ContratoFila>();
      for (const panelId of panelIds) {
        const [porLista, porUnico] = await Promise.all([
          tx.get(db.collection("contratos").where("panel_ids", "array-contains", panelId)),
          tx.get(db.collection("contratos").where("panel_id", "==", panelId)),
        ]);
        [...porLista.docs, ...porUnico.docs].forEach((d) => relevantes.set(d.id, d.data() as ContratoFila));
      }
      // El contrato que se está editando no debe chocar consigo mismo.
      relevantes.delete(contratoId);
      const todos = Array.from(relevantes.values());

      for (const panelId of panelIds) {
        const panelSnap = await tx.get(db.doc(`paneles/${panelId}`));
        const datosPanel = panelSnap.exists ? panelSnap.data() ?? {} : {};
        const cupos = cuposPanel(datosPanel);
        const esLimitado = Number.isFinite(cupos);
        const nombrePanel = String(datosPanel.nombre || "ese panel");

        const cruces = todos.filter((c) => {
          if (c.deleted || !c.inicio || !c.fin) return false;
          if (!esLimitado && String(c.cliente_id ?? "") !== clienteId) return false;
          if (!(c.inicio <= fin && inicio <= c.fin)) return false;
          const idsDeC = c.panel_ids && c.panel_ids.length > 0 ? c.panel_ids : c.panel_id ? [c.panel_id] : [];
          return idsDeC.includes(panelId);
        });

        const limiteAlcanzado = esLimitado ? cruces.length >= cupos : cruces.length > 0;

        if (limiteAlcanzado) {
          const finMasLejano = cruces.reduce((max, c) => (c.fin! > max ? c.fin! : max), cruces[0].fin!);
          const ajeno = cruces.some((c) => String(c.cliente_id ?? "") !== clienteId);
          const quien =
            esLimitado && ajeno
              ? cupos === 1
                ? "Otro cliente ya tiene una lona instalada"
                : `Ya hay ${cupos} campañas activas de otros clientes`
              : "Este cliente ya tiene otra campaña";
          throw new HttpsError(
            "failed-precondition",
            `${quien} en ${nombrePanel} hasta el ${finMasLejano}. Las fechas nuevas se cruzan con esa -- puedes poner esta a partir del ${siguienteDia(finMasLejano)}.`
          );
        }
      }
    }

    tx.update(ref, { nombre, inicio, fin });
  });

  // Las fechas pudieron cambiar si el panel está ocupado HOY -- se
  // recalcula el estado igual que al crear/eliminar (misma lógica
  // compartida en estadoPaneles.ts), en vez de esperar a la tarea diaria.
  if (panelIdsAfectados.length > 0) {
    await recalcularEstadoPaneles(db, panelIdsAfectados);
  }

  return { ok: true };
});
