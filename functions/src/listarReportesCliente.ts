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

/**
 * Lista los reportes de un cliente directamente desde R2 (en vez de
 * depender de una consulta a Firestore con índice compuesto). Los PDFs
 * ya viven en R2 con una key predecible
 * (clientes/{clienteId}/reportes/{mes}/reporte-{digital|hd}.pdf), así
 * que un ListObjectsV2 con ese prefijo alcanza para reconstruir la
 * lista completa: mes, tamaño y fecha salen directo de la respuesta
 * del listado, sin tocar Firestore ni gastar sus lecturas.
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

    // Cada mes tiene un unico PDF (reporte-digital.pdf). Reportes
    // viejos pueden tener ademas un reporte-hd.pdf de cuando existia
    // esa version aparte; si por alguna razon falta el digital pero
    // quedo el hd viejo, lo usamos como respaldo para no perder el
    // reporte de la lista.
    const porMes = new Map<string, { key: string; size: number; fecha?: Date }>();
    for (const obj of listado.Contents ?? []) {
      if (!obj.Key) continue;
      const resto = obj.Key.slice(prefix.length); // "{mes}/reporte-digital.pdf"
      const [mes, archivo] = resto.split("/");
      if (!mes || !archivo) continue;
      const info = { key: obj.Key, size: obj.Size ?? 0, fecha: obj.LastModified };
      if (archivo === "reporte-digital.pdf") {
        porMes.set(mes, info);
      } else if (archivo === "reporte-hd.pdf" && !porMes.has(mes)) {
        porMes.set(mes, info);
      }
    }

    const informes: InformeListado[] = await Promise.all(
      [...porMes.entries()].map(async ([mes, v]) => {
        const url = await firmarLecturaR2(v.key, EXPIRACION_SEGUNDOS);
        const fecha = v.fecha ?? new Date();
        return {
          id: `${clienteId}_${mes}`,
          mes,
          mesLabel: nombreMes(mes),
          url,
          urlDigital: url,
          digitalBytes: v.size,
          storage: "r2" as const,
          r2Keys: { digital: v.key },
          createdAt: fecha.toISOString(),
        };
      })
    );

    informes.sort((a, b) => (a.mes < b.mes ? 1 : -1));

    return { ok: true, informes };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("Error inesperado al listar reportes desde R2.", error);
    const detail = error instanceof Error ? error.message : "Error desconocido";
    throw new HttpsError("internal", `No se pudo leer la lista de reportes en R2: ${detail}`);
  }
});
