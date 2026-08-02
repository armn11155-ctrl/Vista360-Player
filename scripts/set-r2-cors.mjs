/**
 * set-r2-cors.mjs
 *
 * Configura el CORS del bucket de R2 para permitir que el navegador
 * lea (GET) objetos directo con fetch() -- sin esto, un fetch() del
 * navegador a una URL firmada de R2 (*.r2.cloudflarestorage.com, otro
 * dominio) queda bloqueado por el navegador aunque la firma sea
 * válida, porque el bucket no manda los headers CORS de lectura.
 *
 * Esto es justo lo que impedía "adjuntar el PDF de verdad" al
 * compartir por WhatsApp/correo en Reporte y Factura: para esquivarlo
 * se había armado una Cloud Function que leía el objeto del lado del
 * servidor (obtenerArchivoR2Base64) -- funcionaba, pero dependía de
 * que esa función estuviera bien desplegada, y el deploy de Cloud
 * Functions viene siendo frágil (ver el fix de sincronizarEstadoPaneles
 * en el mismo workflow). Con CORS configurado acá, el navegador puede
 * hacer fetch() directo a la URL firmada (la misma que ya se usa para
 * "Ver"/"Descargar") y arma el archivo ahí mismo, sin ningún viaje
 * al servidor de por medio -- igual de simple y confiable que como ya
 * funciona la Cotización (que nunca dependió de ninguna Cloud
 * Function para esto).
 *
 * Es seguro permitir origin "*" para GET: el bucket sigue siendo
 * privado, cada objeto solo se puede leer con una URL firmada válida
 * y no vencida -- CORS no cambia nada de eso, solo si el JAVASCRIPT de
 * un navegador puede LEER la respuesta de una petición que de por sí
 * ya requiere una firma válida para no dar 403.
 */
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";

const accountId = process.env.VAL_R2_ACCOUNT_ID;
const accessKeyId = process.env.VAL_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.VAL_R2_SECRET_ACCESS_KEY;
const bucket = process.env.VAL_R2_BUCKET;

if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  console.error("❌ Faltan variables VAL_R2_ACCOUNT_ID / VAL_R2_ACCESS_KEY_ID / VAL_R2_SECRET_ACCESS_KEY / VAL_R2_BUCKET.");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

const corsRules = [
  {
    AllowedOrigins: ["*"],
    AllowedMethods: ["GET", "HEAD"],
    AllowedHeaders: ["*"],
    ExposeHeaders: ["Content-Type", "Content-Length", "Content-Disposition"],
    MaxAgeSeconds: 3600,
  },
];

try {
  await client.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: corsRules } }));
  console.log(`✅ CORS configurado en el bucket ${bucket} (GET/HEAD desde cualquier origen).`);
  const check = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
  console.log(JSON.stringify(check.CORSRules, null, 2));
} catch (error) {
  console.error("❌ No se pudo configurar CORS:", error);
  process.exit(1);
}
