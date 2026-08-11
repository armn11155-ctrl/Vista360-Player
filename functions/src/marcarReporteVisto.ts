import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { exigirId } from "./identificadores.js";
import { exigirRitmo } from "./limitador.js";
import { guardarMetadataInforme, idKeyDesdeInformeId } from "./agregadoInformes.js";

if (getApps().length === 0) {
  initializeApp();
}

/**
 * Marca un reporte como visto por el cliente -- se llama desde
 * ReportCard.tsx cuando el CLIENTE (no el admin) toca "Ver" o
 * "Descargar". Así el admin puede ver en su lista de reportes si el
 * cliente ya lo revisó o no.
 *
 * El id del reporte (`${clienteId}_${mes}-${dia}`, o `${clienteId}_${mes}`
 * para reportes viejos sin día) es el mismo que usa generarReporteCliente.ts
 * al crear el documento en informesCliente y el que arma
 * listarReportesCliente.ts al listar desde R2 -- por eso alcanza con
 * hacer merge acá, sin depender de que el documento ya exista de
 * antes (algún reporte viejo podría no tener uno todavía).
 *
 * Solo el cliente dueño de esos reportes puede marcarlos como vistos
 * -- ni otro cliente, ni siquiera el admin puede marcar en nombre del
 * cliente (no tendría sentido: "visto por el cliente" solo lo sabe el
 * cliente).
 */
export const marcarReporteVisto = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  // Techo de peticiones por minuto: ver limitador.ts.
  exigirRitmo(uid, "marcarReporteVisto", 120);

  const clienteId = exigirId(request.data?.clienteId, "clienteId");
  const informeId = exigirId(request.data?.informeId, "informeId");
  if (!clienteId || !informeId || !informeId.startsWith(`${clienteId}_`)) {
    throw new HttpsError("invalid-argument", "Envía clienteId e informeId válidos.");
  }
  // El informeId se concatena a una ruta de Firestore más abajo. Sin
  // esto, un informeId con barras ("miCliente_a/b/c") apuntaría a un
  // documento anidado distinto del previsto: seguiría colgando de
  // informesCliente (así que no da acceso a otras colecciones), pero
  // dejaría crear documentos sueltos en rutas inventadas. Se acota a lo
  // que de verdad genera la app: id de cliente, guion bajo, y la fecha.
  if (!/^[A-Za-z0-9_-]+$/.test(informeId)) {
    throw new HttpsError("invalid-argument", "informeId con caracteres no permitidos.");
  }

  // Y EL SUFIJO TIENE QUE SER UNA FECHA.
  //
  // Más abajo se escribe con `set(..., { merge: true })`, que CREA el
  // documento si no existe. Es a propósito: los reportes viejos viven en
  // R2 y puede que no tengan ficha en Firestore, así que exigir que
  // exista rompería "marcar como visto" para ellos.
  //
  // Pero con la comprobación de arriba el cliente elegía el resto del id
  // libremente: llamando en bucle con sufijos distintos fabricaba
  // documentos SIN TOPE en informesCliente y en su agregado. No filtra
  // nada de nadie -- el prefijo lo ata a su propio cliente -- pero crece
  // para siempre y lo paga Vista360.
  //
  // Un informeId real SIEMPRE es `<clienteId>_YYYY-MM` o
  // `<clienteId>_YYYY-MM-DD` (ver cómo se arma idKey en
  // listarReportesCliente.ts). Exigirlo acota lo creable a una ficha por
  // día, que es justo el ritmo de los reportes de verdad.
  const sufijoFecha = informeId.slice(clienteId.length + 1);
  const coincidenciaFecha = /^\d{4}-(\d{2})(?:-(\d{2}))?$/.exec(sufijoFecha);
  // El formato por si solo no alcanza: "2026-13-99" cumple \d{2}-\d{2}
  // pero no es una fecha real. Sin este paso, cualquier mes/dia de dos
  // cifras fabricaba una ficha valida (mismo hueco que el formato ya
  // cerraba para sufijos no numericos), solo que acotado a 100x100
  // combinaciones por año en vez de ilimitado.
  const mesValido = coincidenciaFecha ? Number(coincidenciaFecha[1]) : 0;
  const diaValido = coincidenciaFecha?.[2] ? Number(coincidenciaFecha[2]) : null;
  const fechaValida =
    !!coincidenciaFecha &&
    mesValido >= 1 &&
    mesValido <= 12 &&
    (diaValido === null || (diaValido >= 1 && diaValido <= 31));
  if (!fechaValida) {
    throw new HttpsError("invalid-argument", "informeId no corresponde a un reporte.");
  }

  const db = getFirestore();
  const propio = await db.doc(`portalUsers/${uid}`).get();
  const propioData = propio.data();
  if (!propio.exists || propioData?.clienteId !== clienteId) {
    throw new HttpsError("permission-denied", "Solo el cliente dueño del reporte puede marcarlo como visto.");
  }

  const vistoEn = FieldValue.serverTimestamp();
  await db.doc(`informesCliente/${informeId}`).set(
    {
      cliente_id: clienteId,
      vistoPorCliente: true,
      vistoEn,
    },
    { merge: true }
  );
  await guardarMetadataInforme(db, clienteId, idKeyDesdeInformeId(clienteId, informeId), {
    vistoPorCliente: true,
    vistoEn,
  });

  return { ok: true };
});
