import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { R2_SECRETS, firmarLecturaR2, listarObjetosR2 } from "./r2Storage.js";
import { exigirId } from "./identificadores.js";
import { rutaResumenInformes, type MetadataInformeAgregado } from "./agregadoInformes.js";
import { esPersonalInterno } from "./rolesInternos.js";

if (getApps().length === 0) {
  initializeApp();
}

interface InformeListado {
  id: string;
  mes: string;
  dia?: string;
  mesLabel: string;
  url: string;
  urlDigital: string;
  urlDescarga: string;
  digitalBytes: number;
  storage: "r2";
  r2Keys: { digital: string };
  createdAt: string;
  contratoNombre?: string;
  vistoPorCliente?: boolean;
  vistoEn?: string | null;
  contratoId?: string;
  panelesIncluidos?: string[];
}

interface ResumenInforme {
  id: string;
  mes: string;
  dia?: string;
  mesLabel: string;
  createdAt: string;
}

const EXPIRACION_SEGUNDOS = 6 * 60 * 60;

function nombreMes(mes: string) {
  const [year, month] = mes.split("-").map(Number);
  if (!year || !month) return mes;
  const date = new Date(Date.UTC(year, month - 1, 1));
  const label = new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** Etiqueta corta CON dia ("17 Jul 2026") -- para reportes nuevos (uno
 *  por dia). Los reportes viejos (de antes de este cambio) no tienen
 *  dia -- para esos se mantiene el nombre de mes solo. */
function nombreFechaCorta(mes: string, dia?: string) {
  if (!dia) return nombreMes(mes);
  const [year, month] = mes.split("-").map(Number);
  const diaNum = Number(dia);
  if (!year || !month || !diaNum) return nombreMes(mes);
  return `${String(diaNum).padStart(2, "0")} ${MESES_CORTOS[month - 1]} ${year}`;
}

/**
 * Lista los reportes de un cliente directamente desde R2 (en vez de
 * depender de una consulta a Firestore con índice compuesto). Los PDFs
 * viven en R2 con una key predecible:
 *   - reportes nuevos (uno por dia): clientes/{clienteId}/reportes/{mes}/{dia}/reporte-digital.pdf
 *   - reportes viejos (uno por mes, de antes de este cambio): clientes/{clienteId}/reportes/{mes}/reporte-{digital|hd}.pdf
 * Un ListObjectsV2 con el prefijo del cliente alcanza para reconstruir
 * la lista completa (soportando los dos formatos a la vez). Los pocos
 * campos que solo existen en Firestore se leen desde un agregado anual,
 * no desde un documento por reporte.
 */
export const listarReportesCliente = onCall({ secrets: R2_SECRETS }, async (request) => {
  try {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const clienteId = exigirId(request.data?.clienteId, "clienteId");
    if (!clienteId) {
      throw new HttpsError("invalid-argument", "Falta clienteId.");
    }

    const db = getFirestore();
    const propio = await db.doc(`portalUsers/${uid}`).get();
    const propioData = propio.data();
    // El Trabajador es personal interno, no un cliente.
//
    // Antes acá se preguntaba `role === "admin"`, o sea SOLO el Gerente. Un
    // Trabajador caía por la rama de cliente y, como no tiene clienteId (ver
    // crearTrabajadorAcceso.ts), no cumplía ninguna comprobación de
    // pertenencia: no podía abrir NADA.
//
    // Es el mismo desajuste que ya se corrigió en firestore.rules, que ahora
    // deja al Trabajador leer clientes, contratos, facturas e informes con
    // esPersonalDePortal(). Las reglas decían que sí y las Functions decían
    // que no: un Trabajador generaba un reporte y después no podía verlo.
    const esInterno = esPersonalInterno(propioData?.role);
    if (!propio.exists || (!esInterno && propioData?.clienteId !== clienteId)) {
      throw new HttpsError("permission-denied", "No tienes acceso a los reportes de este cliente.");
    }

    // ListObjectsV2 solo devuelve hasta 1000 objetos POR LLAMADA -- un
    // cliente con reporte diario acumula mas de 1000 objetos en R2 (
    // digital + a veces hd) en poco mas de año y medio. Sin paginar,
    // esta lista se quedaba trunca en silencio (nunca fallaba, solo
    // dejaba de mostrar los reportes mas viejos) a partir de ahi --
    // mismo tipo de paginacion que ya usa obtenerEspacioR2.ts para el
    // bucket completo, aca aplicada al prefijo de un cliente.
    const prefix = `clientes/${clienteId}/reportes/`;
    const objetos: { Key?: string; Size?: number; LastModified?: Date }[] = [];
    let continuationToken: string | undefined;
    do {
      const pagina = await listarObjetosR2({ prefix, continuationToken });
      objetos.push(...(pagina.Contents ?? []));
      continuationToken = pagina.IsTruncated ? pagina.NextContinuationToken : undefined;
    } while (continuationToken);

    // Un reporte por dia (nuevo) o uno por mes (viejo, de antes de
    // este cambio) -- se agrupan por una key unica que distingue ambos
    // casos ("{mes}-{dia}" o solo "{mes}" si no hay dia), asi varios
    // reportes del mismo mes en dias distintos no se pisan entre si.
    // Reportes viejos pueden tener ademas un reporte-hd.pdf de cuando
    // existia esa version aparte; si por alguna razon falta el digital
    // pero quedo el hd viejo, lo usamos como respaldo.
    const porFecha = new Map<string, { key: string; size: number; fecha?: Date; mes: string; dia?: string }>();
    for (const obj of objetos) {
      if (!obj.Key) continue;
      const resto = obj.Key.slice(prefix.length); // "{mes}/{dia}/reporte-digital.pdf" o "{mes}/reporte-digital.pdf"
      const partes = resto.split("/");
      let mes: string | undefined;
      let dia: string | undefined;
      let archivo: string | undefined;
      if (partes.length === 3) {
        [mes, dia, archivo] = partes;
      } else if (partes.length === 2) {
        [mes, archivo] = partes;
      }
      if (!mes || !archivo) continue;
      const idKey = dia ? `${mes}-${dia}` : mes;
      const info = { key: obj.Key, size: obj.Size ?? 0, fecha: obj.LastModified, mes, dia };
      if (archivo === "reporte-digital.pdf") {
        porFecha.set(idKey, info);
      } else if (archivo === "reporte-hd.pdf" && !porFecha.has(idKey)) {
        porFecha.set(idKey, info);
      }
    }

    const fechasOrdenadas = [...porFecha.entries()].sort(([idA], [idB]) =>
      idA < idB ? 1 : idA > idB ? -1 : 0
    );

    // Aviso barato (cero lecturas extra: ya se listó todo arriba) de que
    // el historial de un cliente empieza a ser largo. El modo completo
    // (usado por la pantalla Reportes) manda TODO el historial en una
    // sola respuesta -- no está paginado. Con reporte diario, 700
    // reportes son menos de dos años. No es un problema de lecturas de
    // Firestore (los metadatos siguen viniendo de un agregado por año),
    // pero sí de tamaño de respuesta y de una lista sin fin en pantalla.
    // Cuando esto aparezca en los logs, toca paginar la pantalla
    // Reportes (cambio de diseño, fuera del alcance de esta revisión).
    const AVISO_HISTORIAL_REPORTES = 700;
    if (fechasOrdenadas.length > AVISO_HISTORIAL_REPORTES) {
      console.warn(
        `listarReportesCliente: cliente ${clienteId} tiene ${fechasOrdenadas.length} reportes ` +
          "en R2. El modo completo los manda todos en una sola respuesta sin paginar; " +
          "evaluar paginación en la pantalla Reportes."
      );
    }

    // Inicio solo necesita dos datos: el reporte mas reciente y si ya
    // existe uno del mes actual. Antes llamaba al listado completo, lo
    // que leia un documento de Firestore y firmaba dos URLs POR REPORTE
    // aunque ningun PDF se mostrara en esa pantalla. El modo resumen usa
    // solamente los metadatos devueltos por R2: no descarga archivos, no
    // firma URLs y no lee informesCliente. La pantalla Reportes conserva
    // el flujo completo de abajo y por tanto no pierde ninguna funcion.
    if (request.data?.resumen === true) {
      const primero = fechasOrdenadas[0];
      let ultimoInforme: ResumenInforme | null = null;
      if (primero) {
        const [idKey, v] = primero;
        ultimoInforme = {
          id: `${clienteId}_${idKey}`,
          mes: v.mes,
          ...(v.dia ? { dia: v.dia } : {}),
          mesLabel: nombreFechaCorta(v.mes, v.dia),
          createdAt: (v.fecha ?? new Date()).toISOString(),
        };
      }
      const mesActual = String(request.data?.mesActual ?? "");
      const mesValido = /^\d{4}-\d{2}$/.test(mesActual) ? mesActual : new Date().toISOString().slice(0, 7);
      return {
        ok: true,
        resumen: {
          ultimoInforme,
          reporteEsteMesListo: fechasOrdenadas.some(([, informe]) => informe.mes === mesValido),
        },
      };
    }

    // Los campos de presentación que no existen en R2 (campaña y estado
    // visto) se guardan por año en un documento compacto. Antes se leía
    // informesCliente UNA VEZ POR REPORTE; con historial diario el coste
    // crecía sin límite. Ahora el caso normal es una lectura por año.
    // La primera entrada después del despliegue migra automáticamente los
    // años antiguos y deja el indicador `completo` para no repetirlo.
    const idsPorAnio = new Map<string, string[]>();
    fechasOrdenadas.forEach(([idKey]) => {
      const anio = idKey.slice(0, 4);
      const lista = idsPorAnio.get(anio) ?? [];
      lista.push(idKey);
      idsPorAnio.set(anio, lista);
    });
    const anios = [...idsPorAnio.keys()].filter((anio) => /^\d{4}$/.test(anio));
    const refsResumen = anios.map((anio) => db.doc(rutaResumenInformes(clienteId, anio)));
    const snapsResumen = refsResumen.length > 0 ? await db.getAll(...refsResumen) : [];
    const metadataPorId = new Map<string, MetadataInformeAgregado>();

    for (let i = 0; i < anios.length; i += 1) {
      const anio = anios[i]!;
      const snap = snapsResumen[i];
      const datos = snap?.data() as
        | { completo?: boolean; informes?: Record<string, MetadataInformeAgregado> }
        | undefined;
      if (snap?.exists && datos?.completo && datos.informes) {
        Object.entries(datos.informes).forEach(([idKey, metadata]) => metadataPorId.set(idKey, metadata));
        continue;
      }

      const ids = idsPorAnio.get(anio) ?? [];
      const docs = ids.length > 0
        ? await db.getAll(...ids.map((idKey) => db.doc(`informesCliente/${clienteId}_${idKey}`)))
        : [];
      const migrados: Record<string, MetadataInformeAgregado> = {};
      docs.forEach((docSnap, indice) => {
        const idKey = ids[indice]!;
        const data = docSnap.exists ? docSnap.data() ?? {} : {};
        const metadata: MetadataInformeAgregado = {
          ...(data.contratoNombre ? { contratoNombre: String(data.contratoNombre) } : {}),
          vistoPorCliente: Boolean(data.vistoPorCliente),
          ...(data.vistoEn ? { vistoEn: data.vistoEn } : {}),
          ...(data.contrato_id ? { contrato_id: String(data.contrato_id) } : {}),
          ...(Array.isArray(data.panelesIncluidos)
            ? { panelesIncluidos: data.panelesIncluidos.map(String) }
            : {}),
        };
        migrados[idKey] = metadata;
        metadataPorId.set(idKey, metadata);
      });
      await refsResumen[i]!.set(
        { informes: migrados, completo: true, actualizadoEn: new Date().toISOString() },
        { merge: true }
      );
    }

    const informes: InformeListado[] = await Promise.all(
      fechasOrdenadas.map(async ([idKey, v]) => {
        const id = `${clienteId}_${idKey}`;
        // Una sola firma por reporte. El navegador descarga desde un
        // Blob local y asigna el nombre del archivo ahí mismo, por lo que
        // firmar una segunda URL con Content-Disposition duplicaba el
        // trabajo del backend sin aportar nada al flujo actual.
        const url = await firmarLecturaR2(v.key, EXPIRACION_SEGUNDOS);
        const infoData = metadataPorId.get(idKey) ?? {};
        const fecha = v.fecha ?? new Date();
        return {
          id,
          mes: v.mes,
          dia: v.dia,
          mesLabel: nombreFechaCorta(v.mes, v.dia),
          url,
          urlDigital: url,
          urlDescarga: url,
          digitalBytes: v.size,
          storage: "r2" as const,
          r2Keys: { digital: v.key },
          createdAt: fecha.toISOString(),
          ...(infoData.contratoNombre ? { contratoNombre: String(infoData.contratoNombre) } : {}),
          vistoPorCliente: Boolean(infoData.vistoPorCliente),
          vistoEn:
            infoData.vistoEn && typeof infoData.vistoEn === "object" && "toDate" in infoData.vistoEn
              ? (infoData.vistoEn as { toDate: () => Date }).toDate().toISOString()
              : null,
          ...(infoData.contrato_id ? { contratoId: String(infoData.contrato_id) } : {}),
          ...(Array.isArray(infoData.panelesIncluidos) ? { panelesIncluidos: infoData.panelesIncluidos.map(String) } : {}),
        };
      })
    );

    return { ok: true, informes };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("Error inesperado al listar reportes desde R2.", error);
    const detail = error instanceof Error ? error.message : "Error desconocido";
    throw new HttpsError("internal", `No se pudo leer la lista de reportes en R2: ${detail}`);
  }
});
