import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { R2_SECRETS, firmarLecturaR2, r2Bucket, r2Client } from "./r2Storage.js";

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
  digitalBytes: number;
  storage: "r2";
  r2Keys: { digital: string };
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
 * la lista completa (soportando los dos formatos a la vez), sin tocar
 * Firestore ni gastar sus lecturas.
 */
export const listarReportesCliente = onCall({ secrets: R2_SECRETS }, async (request) => {
  try {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const clienteId = String(request.data?.clienteId ?? "");
    if (!clienteId) {
      throw new HttpsError("invalid-argument", "Falta clienteId.");
    }

    const db = getFirestore();
    const propio = await db.doc(`portalUsers/${uid}`).get();
    const propioData = propio.data();
    const esAdmin = propioData?.role === "admin";
    if (!propio.exists || (!esAdmin && propioData?.clienteId !== clienteId)) {
      throw new HttpsError("permission-denied", "No tienes acceso a los reportes de este cliente.");
    }

    const prefix = `clientes/${clienteId}/reportes/`;
    const listado = await r2Client().send(
      new ListObjectsV2Command({ Bucket: r2Bucket(), Prefix: prefix })
    );

    // Un reporte por dia (nuevo) o uno por mes (viejo, de antes de
    // este cambio) -- se agrupan por una key unica que distingue ambos
    // casos ("{mes}-{dia}" o solo "{mes}" si no hay dia), asi varios
    // reportes del mismo mes en dias distintos no se pisan entre si.
    // Reportes viejos pueden tener ademas un reporte-hd.pdf de cuando
    // existia esa version aparte; si por alguna razon falta el digital
    // pero quedo el hd viejo, lo usamos como respaldo.
    const porFecha = new Map<string, { key: string; size: number; fecha?: Date; mes: string; dia?: string }>();
    for (const obj of listado.Contents ?? []) {
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

    const informes: InformeListado[] = await Promise.all(
      [...porFecha.entries()].map(async ([idKey, v]) => {
        const url = await firmarLecturaR2(v.key, EXPIRACION_SEGUNDOS);
        const fecha = v.fecha ?? new Date();
        return {
          id: `${clienteId}_${idKey}`,
          mes: v.mes,
          dia: v.dia,
          mesLabel: nombreFechaCorta(v.mes, v.dia),
          url,
          urlDigital: url,
          digitalBytes: v.size,
          storage: "r2" as const,
          r2Keys: { digital: v.key },
          createdAt: fecha.toISOString(),
        };
      })
    );

    informes.sort((a, b) => {
      const fa = a.dia ? `${a.mes}-${a.dia}` : a.mes;
      const fb = b.dia ? `${b.mes}-${b.dia}` : b.mes;
      return fa < fb ? 1 : fa > fb ? -1 : 0;
    });

    return { ok: true, informes };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("Error inesperado al listar reportes desde R2.", error);
    const detail = error instanceof Error ? error.message : "Error desconocido";
    throw new HttpsError("internal", `No se pudo leer la lista de reportes en R2: ${detail}`);
  }
});
