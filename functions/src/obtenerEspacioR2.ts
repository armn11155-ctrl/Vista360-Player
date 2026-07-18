import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { R2_SECRETS, r2Bucket, r2Client } from "./r2Storage.js";

if (getApps().length === 0) {
  initializeApp();
}

/**
 * Devuelve cuánto espacio ocupa en total el bucket de R2 (fotos,
 * avatares, reportes, facturas, todo junto) — solo para el admin, se
 * muestra como referencia en el selector de clientes. Recorre todos
 * los objetos con ListObjectsV2 (pagina de a 1000) y suma el tamaño.
 * Para el tamaño actual del bucket es instantáneo; si algún día crece
 * mucho, convendría cachear el resultado en vez de recalcularlo cada
 * vez que se abre la pantalla.
 */
export const obtenerEspacioR2 = onCall({ secrets: R2_SECRETS }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const db = getFirestore();
  const snap = await db.doc(`portalUsers/${uid}`).get();
  if (!snap.exists || snap.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Solo la cuenta admin puede ver esto.");
  }

  const client = r2Client();
  const bucket = r2Bucket();
  let totalBytes = 0;
  let totalObjetos = 0;
  let continuationToken: string | undefined;
  let paginas = 0;
  const muestra: { key: string; size: number }[] = [];

  do {
    const resultado = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken })
    );
    paginas += 1;
    for (const obj of resultado.Contents ?? []) {
      totalBytes += obj.Size ?? 0;
      totalObjetos += 1;
      if (muestra.length < 30 && obj.Key) {
        muestra.push({ key: obj.Key, size: obj.Size ?? 0 });
      }
    }
    continuationToken = resultado.IsTruncated ? resultado.NextContinuationToken : undefined;
  } while (continuationToken);

  // Temporal: devolvemos el bucket/detalle usado para poder comparar
  // contra lo que se ve en el dashboard de Cloudflare y encontrar por
  // qué no coincide.
  return { totalBytes, totalObjetos, bucket, paginas, muestra };
});
