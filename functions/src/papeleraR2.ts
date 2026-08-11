import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { esGerente } from "./rolesInternos.js";
import {
  R2_SECRETS,
  PAPELERA_PREFIJO,
  listarObjetosR2,
  esClavePapelera,
  rutaOriginalDesdeClavePapelera,
  esRutaOriginalPermitida,
  datosRutaReporte,
  restaurarObjetoR2,
} from "./r2Storage.js";
import { auditar, auditarFallo } from "./registro.js";

if (getApps().length === 0) {
  initializeApp();
}

/**
 * Papelera de R2, vista desde la app -- para no tener que entrar al
 * dashboard de Cloudflare a mano cada vez que alguien borra algo por
 * error. Solo dos operaciones a propósito: LISTAR y RESTAURAR. No hay
 * "eliminar definitivamente" -- ya existe una regla de ciclo de vida en
 * Cloudflare que borra sola lo que lleva 30 días en `_papelera/` (ver
 * PAPELERA_PREFIJO en r2Storage.ts y docs/RECUPERACION-DE-DATOS.md), y
 * añadir un botón de borrado manual acá solo suma una forma más de
 * borrar algo por accidente por segunda vez.
 *
 * Todo lo de acá es Gerente/Admin únicamente: la papelera puede
 * contener facturas, fotos de campaña o comprobantes de pago de
 * cualquier cliente, sin el filtrado por cliente que sí tienen el resto
 * de las pantallas. Un Trabajador o un Cliente no deben poder ni listar
 * ni restaurar nada de acá -- exigirGerente() corta ambas rutas antes
 * de tocar R2.
 */

/** Ver la nota sobre "_papelera/ -> borrar tras 30 días" en r2Storage.ts.
 *  Este número es solo para mostrar "días restantes aprox." en la
 *  interfaz -- si el valor de la regla de Cloudflare cambia, hay que
 *  actualizar este también, pero no controla el borrado real. */
const DIAS_DE_VIDA_EN_PAPELERA = 30;

/** Texto exacto que debe ver el Gerente cuando restaurar el archivo NO
 *  alcanza para dejar el recurso como estaba (por ejemplo, la factura ya
 *  no existe en Firestore aunque el PDF vuelva a R2). */
const MENSAJE_RECUPERACION_ADICIONAL = "Este elemento requiere recuperación adicional de datos.";

async function exigirGerente(uid: string | undefined, db: Firestore): Promise<string> {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }
  const propio = await db.doc(`portalUsers/${uid}`).get();
  const rol = propio.data()?.role;
  // esGerente(), no esPersonalInterno(): esto ya se confundió una vez en
  // producción (ver src/logica-negocio/menuPorRol.test.ts) y dejó a un
  // Trabajador viendo una pantalla que era solo para el admin. Acá el
  // costo de repetir ese error es mayor -- la papelera tiene facturas y
  // comprobantes de pago de TODOS los clientes, no solo los propios.
  if (!propio.exists || !esGerente(rol)) {
    throw new HttpsError("permission-denied", "Solo la cuenta admin puede usar la papelera.");
  }
  return String(rol ?? "");
}

type TipoRecurso = "Factura" | "Foto de campaña" | "Avatar de cliente" | "Reporte de cliente" | "Archivo";

interface Clasificacion {
  tipo: TipoRecurso;
  clienteId: string | null;
}

/** Clasifica la ruta ORIGINAL (no la de la papelera) según la carpeta a
 *  la que pertenece. Es solo para mostrar algo legible en la lista --
 *  no decide permisos ni valida nada, eso ya pasó en esRutaOriginalPermitida. */
function clasificarRuta(rutaOriginal: string): Clasificacion {
  if (rutaOriginal.startsWith("vista360/facturas/")) return { tipo: "Factura", clienteId: null };
  if (rutaOriginal.startsWith("vista360/avatares/")) return { tipo: "Avatar de cliente", clienteId: null };
  if (rutaOriginal.startsWith("vista360/campanas/")) return { tipo: "Foto de campaña", clienteId: null };
  const reporte = datosRutaReporte(rutaOriginal);
  if (reporte) return { tipo: "Reporte de cliente", clienteId: reporte.clienteId };
  return { tipo: "Archivo", clienteId: null };
}

/**
 * ¿Sigue habiendo, AHORA MISMO en Firestore, algo que apunte a esta
 * ruta? Es la única señal honesta de "restaurar el archivo alcanza para
 * restaurar el recurso completo". Se revisó caso por caso qué borra
 * cada función antes de escribir esto:
 *
 *  - eliminarFactura.ts borra el PDF Y el documento de "facturas" ->
 *    si el documento ya no está, restaurar el PDF deja un archivo
 *    huérfano en R2, no una factura visible en la app.
 *  - eliminarContrato.ts / eliminarSolicitudCampana.ts borran la foto
 *    de portada/comprobante Y el documento entero -> mismo caso.
 *  - actualizarAvatarCliente.ts / actualizarImagenCampania.ts SOLO
 *    reemplazan: el documento sigue intacto, solo que ya apunta a la
 *    key nueva. Restaurar el archivo viejo no cambia lo que la app
 *    muestra hoy (el campo sigue apuntando a la key nueva) -- pero el
 *    archivo en sí queda disponible por si hiciera falta de forma
 *    manual, así que tampoco es un "recurso roto".
 *  - eliminarReporteCliente.ts borra el/los PDF y el documento de
 *    "informesCliente" -> mismo caso que factura/contrato.
 *
 * En los cuatro casos de borrado completo, "no hay referencia viva" es
 * exactamente lo que se espera después de un borrado normal -- así que
 * NO se puede usar esa señal para "distinguir un borrado normal de uno
 * accidental". Lo que sí permite hacer con ella, de forma honesta, es
 * avisar: "esto que vas a restaurar no va a volver a aparecer solo en
 * la app -- el archivo vuelve, pero el registro no". Por eso el default
 * es SIEMPRE avisar cuando no se encuentra referencia, en vez de asumir
 * que no pasa nada.
 */
async function evaluarEstadoDelRecurso(
  db: Firestore,
  rutaOriginal: string,
  clasificacion: Clasificacion
): Promise<{ clienteId: string | null; requiereRecuperacionAdicional: boolean }> {
  switch (clasificacion.tipo) {
    case "Factura": {
      const q = await db.collection("facturas").where("pdfUrl", "==", rutaOriginal).limit(1).get();
      if (q.empty) return { clienteId: null, requiereRecuperacionAdicional: true };
      return { clienteId: String(q.docs[0].data()?.cliente_id ?? "") || null, requiereRecuperacionAdicional: false };
    }
    case "Foto de campaña": {
      const [contratos, refCampana, comprobante] = await Promise.all([
        db.collection("contratos").where("imagenCampaniaUrl", "==", rutaOriginal).limit(1).get(),
        db.collection("solicitudesCampana").where("imagenReferencialUrl", "==", rutaOriginal).limit(1).get(),
        db.collection("solicitudesCampana").where("comprobantePagoUrl", "==", rutaOriginal).limit(1).get(),
      ]);
      const encontrado = !contratos.empty ? contratos : !refCampana.empty ? refCampana : !comprobante.empty ? comprobante : null;
      if (!encontrado) return { clienteId: null, requiereRecuperacionAdicional: true };
      return { clienteId: String(encontrado.docs[0].data()?.cliente_id ?? "") || null, requiereRecuperacionAdicional: false };
    }
    case "Avatar de cliente": {
      const q = await db.collection("clientes").where("avatarUrl", "==", rutaOriginal).limit(1).get();
      if (q.empty) return { clienteId: null, requiereRecuperacionAdicional: true };
      // Un reemplazo de avatar no borra el documento del cliente -- solo
      // deja de apuntar a esta key. No se marca como "requiere
      // recuperación adicional": el cliente sigue existiendo tal cual.
      return { clienteId: q.docs[0].id, requiereRecuperacionAdicional: false };
    }
    case "Reporte de cliente": {
      const reporte = datosRutaReporte(rutaOriginal);
      if (!reporte) return { clienteId: null, requiereRecuperacionAdicional: true };
      const snap = await db.doc(`informesCliente/${reporte.clienteId}_${reporte.mes}-${reporte.dia}`).get();
      return { clienteId: reporte.clienteId, requiereRecuperacionAdicional: !snap.exists };
    }
    default:
      return { clienteId: null, requiereRecuperacionAdicional: true };
  }
}

/**
 * Lista lo que hay en `_papelera/` con datos legibles para el Gerente:
 * tipo de recurso, cliente relacionado (si se puede determinar), ruta
 * original, cuándo se borró, tamaño y días restantes aproximados antes
 * de que la regla de ciclo de vida de Cloudflare lo borre solo.
 *
 * La "key" cruda de R2 SÍ viaja en la respuesta (en el campo `clave`),
 * pero como dato interno para que el botón Restaurar sepa qué mandar de
 * vuelta -- la interfaz no la muestra como un campo editable ni la usa
 * como control; lo que se ve es tipo/ruta/fecha/tamaño.
 */
export const listarPapelera = onCall({ secrets: R2_SECRETS }, async (request) => {
  const uid = request.auth?.uid;
  const db = getFirestore();
  try {
    await exigirGerente(uid, db);

    const objetos: { Key?: string; Size?: number; LastModified?: Date }[] = [];
    let continuationToken: string | undefined;
    let paginas = 0;
    // Tope defensivo (20 páginas ~ 20,000 objetos con el tamaño de
    // página por defecto de R2): no se espera ni de lejos llegar acá con
    // el volumen actual del bucket, pero evita un bucle infinito si R2
    // devolviera un token de continuación raro.
    do {
      const pagina = await listarObjetosR2({ prefix: PAPELERA_PREFIJO, continuationToken });
      objetos.push(...(pagina.Contents ?? []));
      continuationToken = pagina.IsTruncated ? pagina.NextContinuationToken : undefined;
      paginas += 1;
    } while (continuationToken && paginas < 20);

    const ahora = Date.now();
    const items = await Promise.all(
      objetos
        .filter((o) => esClavePapelera(o.Key ?? ""))
        .map(async (o) => {
          const clave = o.Key as string;
          const rutaOriginal = rutaOriginalDesdeClavePapelera(clave);
          const permitida = esRutaOriginalPermitida(rutaOriginal);
          const clasificacion = clasificarRuta(rutaOriginal);
          const { clienteId, requiereRecuperacionAdicional } = permitida
            ? await evaluarEstadoDelRecurso(db, rutaOriginal, clasificacion)
            : { clienteId: null, requiereRecuperacionAdicional: true };

          const eliminadoEl = o.LastModified ? o.LastModified.toISOString() : null;
          const diasTranscurridos = o.LastModified ? (ahora - o.LastModified.getTime()) / 86_400_000 : 0;
          const diasRestantes = Math.max(0, Math.ceil(DIAS_DE_VIDA_EN_PAPELERA - diasTranscurridos));

          return {
            clave,
            rutaOriginal,
            tipo: clasificacion.tipo,
            clienteId,
            eliminadoEl,
            diasRestantes,
            tamanoBytes: typeof o.Size === "number" ? o.Size : null,
            // Defensa en profundidad: si algún día apareciera una key en
            // _papelera/ que no corresponde a ninguna carpeta conocida
            // (movida a mano en el bucket, fuera de esta app), se lista
            // igual -- para que sea visible -- pero no se deja restaurar.
            restaurable: permitida,
            requiereRecuperacionAdicional,
            mensajeAdicional: requiereRecuperacionAdicional ? MENSAJE_RECUPERACION_ADICIONAL : null,
          };
        })
    );

    items.sort((a, b) => (b.eliminadoEl ?? "").localeCompare(a.eliminadoEl ?? ""));

    return { items };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("Error inesperado al listar la papelera.", error);
    const detail = error instanceof Error ? error.message : "Error desconocido";
    throw new HttpsError("internal", `No se pudo listar la papelera: ${detail}`);
  }
});

/**
 * Restaura un archivo de la papelera a su ruta original.
 *
 * El navegador SOLO manda `clave` (la key dentro de `_papelera/`, tal
 * cual la devolvió listarPapelera). Nunca manda una ruta de destino --
 * si la mandara, esto sería tan fuerte como el propio navegador
 * quisiera, y cualquiera con la consola abierta podría pedir "restaura
 * esto encima de la carpeta que yo diga". La ruta de destino sale
 * SIEMPRE de restarle el prefijo `_papelera/` a la propia key (ver
 * rutaOriginalDesdeClavePapelera en r2Storage.ts), y esa ruta resultante
 * se vuelve a validar contra las carpetas conocidas antes de escribir
 * nada (esRutaOriginalPermitida). Entre key manipulada, ruta con ".." y
 * carpeta de destino fuera de lo permitido, las tres quedan cubiertas
 * antes de que restaurarObjetoR2 toque R2.
 */
export const restaurarDePapelera = onCall({ secrets: R2_SECRETS }, async (request) => {
  const uid = request.auth?.uid;
  const db = getFirestore();
  const clavePapelera = String(request.data?.clave ?? "");
  let rol = "";
  try {
    // 1-2: sesión válida y Gerente/Admin.
    rol = await exigirGerente(uid, db);

    // 3: la key tiene que estar de verdad dentro de "_papelera/".
    if (!esClavePapelera(clavePapelera)) {
      throw new HttpsError("invalid-argument", "Esa key no pertenece a la papelera.");
    }

    // 4: la ruta original sale SOLO de la propia key -- nunca de otro campo.
    const rutaOriginal = rutaOriginalDesdeClavePapelera(clavePapelera);

    // 5: esa ruta tiene que caer dentro de una carpeta permitida.
    if (!esRutaOriginalPermitida(rutaOriginal)) {
      throw new HttpsError(
        "invalid-argument",
        "La ruta original de este archivo no pertenece a una carpeta permitida de la app."
      );
    }

    // 6-7: copiar de _papelera/... a la ruta original y verificar que
    // la copia exista de verdad (restaurarObjetoR2 además rechaza si ya
    // hay algo escrito en esa ruta, para no sobrescribir algo vivo).
    const bytesRestaurados = await restaurarObjetoR2(rutaOriginal);

    // 8: la copia en _papelera/ NO se borra -- se deja que la limpie
    // sola la regla de ciclo de vida de 30 días. Guardarla no cuesta
    // nada extra (ya estaba copiada) y da margen para deshacer una
    // restauración equivocada.
    const clasificacion = clasificarRuta(rutaOriginal);
    const { clienteId, requiereRecuperacionAdicional } = await evaluarEstadoDelRecurso(db, rutaOriginal, clasificacion);

    // 9: auditoría -- quién, qué, cuándo, cliente relacionado si aplica.
    auditar("archivo_restaurado_papelera", {
      uid,
      rol,
      objetivoId: rutaOriginal,
      clienteId: clienteId ?? undefined,
      tipo: clasificacion.tipo,
      bytes: bytesRestaurados,
    });

    return {
      ok: true,
      rutaOriginal,
      tipo: clasificacion.tipo,
      requiereRecuperacionAdicional,
      mensajeAdicional: requiereRecuperacionAdicional ? MENSAJE_RECUPERACION_ADICIONAL : null,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    auditarFallo("archivo_restaurado_papelera", error, { uid, rol, objetivoId: clavePapelera });
    console.error("Error inesperado al restaurar desde la papelera.", error);
    const detail = error instanceof Error ? error.message : "Error desconocido";
    throw new HttpsError("internal", `No se pudo restaurar el archivo: ${detail}`);
  }
});
