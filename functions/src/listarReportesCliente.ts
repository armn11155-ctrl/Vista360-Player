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
  urlHd: string;
  hdBytes: number;
  digitalBytes: number;
  storage: "r2";
  r2Keys: { digital: string; hd: string };
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

  const porMes = new Map<string, { digital?: { size: number; fecha?: Date }; hd?: { size: number; fecha?: Date } }>();
  for (const obj of listado.Contents ?? []) {
    if (!obj.Key) continue;
    const resto = obj.Key.slice(prefix.length); // "{mes}/reporte-digital.pdf"
    const [mes, archivo] = resto.split("/");
    if (!mes || !archivo) continue;
    const entry = porMes.get(mes) ?? {};
    const info = { size: obj.Size ?? 0, fecha: obj.LastModified };
    if (archivo === "reporte-digital.pdf") entry.digital = info;
    if (archivo === "reporte-hd.pdf") entry.hd = info;
    porMes.set(mes, entry);
  }

  const informes: InformeListado[] = await Promise.all(
    [...porMes.entries()]
      .filter(([, v]) => v.digital || v.hd)
      .map(async ([mes, v]) => {
        const keyDigital = `${prefix}${mes}/reporte-digital.pdf`;
        const keyHd = `${prefix}${mes}/reporte-hd.pdf`;
        const [urlDigital, urlHd] = await Promise.all([
          v.digital ? firmarLecturaR2(keyDigital, EXPIRACION_SEGUNDOS) : Promise.resolve(""),
          v.hd ? firmarLecturaR2(keyHd, EXPIRACION_SEGUNDOS) : Promise.resolve(""),
        ]);
        const fecha = v.digital?.fecha ?? v.hd?.fecha ?? new Date();
        return {
          id: `${clienteId}_${mes}`,
          mes,
          mesLabel: nombreMes(mes),
          url: urlDigital || urlHd,
          urlDigital: urlDigital || urlHd,
          urlHd: urlHd || urlDigital,
          hdBytes: v.hd?.size ?? 0,
          digitalBytes: v.digital?.size ?? 0,
          storage: "r2" as const,
          r2Keys: { digital: keyDigital, hd: keyHd },
          createdAt: fecha.toISOString(),
        };
      })
  );

  informes.sort((a, b) => (a.mes < b.mes ? 1 : -1));

  return { ok: true, informes };
});
