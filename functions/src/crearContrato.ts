import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { cuposPanel } from "./modalidadPanel.js";
import { recalcularEstadoPaneles } from "./estadoPaneles.js";
import { contratosQuePuedenChocar } from "./contratosDePaneles.js";
import { esPersonalInterno } from "./rolesInternos.js";
import { auditar } from "./registro.js";
import { regenerarAgregadoClientes } from "./agregadoClientes.js";

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
  try {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const db = getFirestore();
    const propio = await db.doc(`portalUsers/${uid}`).get();
    if (!propio.exists || !esPersonalInterno(propio.data()?.role)) {
      throw new HttpsError("permission-denied", "Solo el equipo interno puede crear campañas.");
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

    // Cruce de fechas. La regla depende de QUÉ tipo de soporte es:
    //
    //  - Pantalla LED: rota anuncios en bucle, así que varios clientes
    //    pueden estar al aire a la vez. Solo se bloquea que el MISMO
    //    cliente tenga dos campañas cruzadas en el mismo panel.
    //
    //  - Lona / mural / valla impresa: es UNA pieza física instalada.
    //    Mientras esté puesta la de un cliente no puede haber otra, así
    //    que se bloquea el cruce con CUALQUIER cliente. Antes esto no se
    //    revisaba (todo se trataba como LED) y se podía vender dos veces
    //    la misma lona en las mismas fechas.
    //
    // Esto va dentro de una TRANSACCION a proposito: antes se leia
    // "los contratos de este cliente", se revisaba en memoria, y RECIEN
    // despues se escribia el contrato nuevo -- si dos llamadas llegaban
    // casi al mismo tiempo (doble click, dos pestañas del admin
    // abiertas), las DOS podian leer "sin cruces" antes de que
    // cualquiera hubiera escrito nada, y las dos terminaban creando
    // campañas superpuestas para el mismo cliente+panel (la regla de
    // negocio que esto deberia impedir). Con runTransaction, Firestore
    // reintenta la funcion completa si algo que leyo cambio antes de
    // que termine de escribir -- en el reintento, la segunda llamada
    // SI ve el contrato que la primera ya creo, y el cruce se detecta
    // como corresponde.
    const contratoRef = db.collection("contratos").doc();
    await db.runTransaction(async (tx) => {
      // Para poder aplicar la regla de exclusividad hay que mirar los
      // contratos de TODOS los clientes, no solo los de este -- después
      // se filtra según la modalidad de cada panel.
      //
      // Solo los contratos que PUEDEN chocar: filtrados por panel Y
      // por fecha directamente en Firestore. Ver el comentario largo de
      // contratosDePaneles.ts -- incluye por qué no se lee la colección
      // entera (crecía con todo el negocio) y qué pasa si falta el
      // índice compuesto (se degrada, no se rompe).
      const relevantes = await contratosQuePuedenChocar(db, tx, panelIds, inicio);
      const todos = Array.from(relevantes.values());

      for (const panelId of panelIds) {
        const panelSnap = await tx.get(db.doc(`paneles/${panelId}`));
        const datosPanel = panelSnap.exists ? panelSnap.data() ?? {} : {};
        const cupos = cuposPanel(datosPanel);
        const esLimitado = Number.isFinite(cupos);
        const nombrePanel = String(datosPanel.nombre || "ese panel");

        const cruces = todos.filter((c) => {
          if (c.deleted || !c.inicio || !c.fin) return false;
          // En LED solo importa el propio cliente (sin límite real de
          // anunciantes); en soportes con cupo limitado (lona/mural/
          // paradero: 1, unipolar: 2) se cuentan las campañas de
          // CUALQUIER cliente, porque el cupo es físico.
          if (!esLimitado && String(c.cliente_id ?? "") !== clienteId) return false;
          if (!(c.inicio <= fin && inicio <= c.fin)) return false;
          const idsDeC = c.panel_ids && c.panel_ids.length > 0 ? c.panel_ids : c.panel_id ? [c.panel_id] : [];
          return idsDeC.includes(panelId);
        });

        // Sin cupo limitado (LED), basta con que el propio cliente ya
        // tenga algo cruzado. Con cupo limitado, se bloquea recién
        // cuando ya hay tantas campañas cruzadas como cupos tiene el
        // soporte (1 en lona/mural/paradero, 2 en unipolar).
        const limiteAlcanzado = esLimitado ? cruces.length >= cupos : cruces.length > 0;

        if (limiteAlcanzado) {
          const finMasLejano = cruces.reduce((max, c) => (c.fin! > max ? c.fin! : max), cruces[0].fin!);
          const ajeno = cruces.some((c) => String(c.cliente_id ?? "") !== clienteId);
          let quien = "Este cliente ya tiene una campaña";
          if (esLimitado && ajeno) {
            const otroId = String(cruces.find((c) => String(c.cliente_id ?? "") !== clienteId)?.cliente_id ?? "");
            const otroSnap = otroId ? await tx.get(db.doc(`clientes/${otroId}`)) : null;
            const otroNombre = otroSnap?.exists ? String(otroSnap.data()?.empresa || "otro cliente") : "otro cliente";
            quien = cupos === 1 ? `${otroNombre} ya tiene una lona instalada` : `Ya hay ${cupos} campañas activas de otros clientes`;
          }
          throw new HttpsError(
            "failed-precondition",
            `${quien} en ${nombrePanel} hasta el ${finMasLejano}. ${
              !esLimitado
                ? "No puede tener dos campañas activas a la vez en el mismo panel."
                : cupos === 1
                ? "Es un soporte impreso de una sola cara: solo puede haber una campaña a la vez."
                : `Este soporte admite como máximo ${cupos} campañas cruzadas a la vez (una por cara).`
            } Puedes programar esta a partir del ${siguienteDia(finMasLejano)}.`
          );
        }
      }

      tx.set(contratoRef, {
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
    });

    // Deja el estado (Ocupado/Disponible) de cada panel elegido en
    // sintonía con sus contratos vigentes hoy -- ya no un "Ocupado" a
    // ciegas para todos: en un soporte con más de un cupo (unipolar)
    // puede seguir Disponible si todavía queda una cara libre, y en LED
    // nunca se marca Ocupado por esto (no tiene límite real). Si algo
    // falla, no se revierte la campaña ya creada -- se avisa igual con
    // éxito, el panel se puede corregir a mano desde Paneles si hiciera
    // falta, o lo arregla solo la tarea diaria.
    await recalcularEstadoPaneles(db, panelIds);

    auditar("contrato_creado", {
      uid,
      clienteId,
      objetivoId: contratoRef.id,
      paneles: panelIds.length,
      inicio,
      fin,
    });

    // Mantiene al dia el agregado del selector (lista de clientes y su
    // conteo de campanas activas). No lanza: si falla, el selector cae
    // a leer la coleccion directamente.
    await regenerarAgregadoClientes(db);
    return { ok: true, contratoId: contratoRef.id };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    // Cualquier otro error (de Firestore, de red, etc.) se manda con
    // el detalle real -- antes esto se perdía y el cliente solo veía
    // el mensaje generico "internal", imposible de diagnosticar sin
    // revisar los logs del servidor.
    console.error("Error inesperado al crear la campaña.", error);
    const detail = error instanceof Error ? error.message : "Error desconocido";
    throw new HttpsError("internal", `No se pudo crear la campaña: ${detail}`);
  }
});
