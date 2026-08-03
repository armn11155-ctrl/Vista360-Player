/**
 * set-r2-cors.mjs
 *
 * Configura el CORS del bucket de R2 para permitir que el navegador
 * hable directo con R2 por fetch() -- sin esto, un fetch() del
 * navegador a una URL firmada de R2 (*.r2.cloudflarestorage.com, otro
 * dominio) queda bloqueado por el navegador aunque la firma sea
 * válida, porque el bucket no manda los headers CORS necesarios.
 *
 * Dos usos MUY distintos comparten este mismo bucket, por eso hacen
 * falta métodos distintos:
 *
 *  - LECTURA (GET/HEAD): "Ver"/"Descargar" en Reporte y Factura, y
 *    compartir el PDF de verdad por WhatsApp/correo con fetch()
 *    directo a la URL firmada -- antes dependía de una Cloud Function
 *    que leía el objeto del lado del servidor (obtenerArchivoR2Base64),
 *    lento y frágil.
 *  - ESCRITURA (PUT): subir fotos/archivos directo desde el navegador
 *    con la URL firmada que devuelve crearSubidaR2 (fotos de reporte,
 *    avatares, adjuntos de factura). Sin PUT en esta lista, cualquier
 *    subida queda bloqueada por CORS -- y como fetch() no distingue
 *    "bloqueado por CORS" de "sin señal", en la app se ve como un
 *    falso "sin conexión, revisa tu internet" aunque el celular esté
 *    perfectamente conectado.
 *
 * OJO: PutBucketCors REEMPLAZA toda la config anterior, no la suma --
 * por eso este archivo tiene que traer TODOS los métodos que la app
 * necesita a la vez. Si en el futuro se agrega otro uso de R2 (DELETE,
 * por ejemplo), hay que sumarlo acá, no crear un script aparte.
 *
 * Es seguro permitir origin "*": el bucket sigue siendo privado, cada
 * objeto solo se puede leer o escribir con una URL firmada válida y no
 * vencida -- CORS no cambia nada de eso, solo si el JAVASCRIPT de un
 * navegador puede completar una petición que de por sí ya requiere una
 * firma válida para no dar 403.
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
    AllowedMethods: ["GET", "HEAD", "PUT"],
    AllowedHeaders: ["*"],
    ExposeHeaders: ["Content-Type", "Content-Length", "Content-Disposition"],
    MaxAgeSeconds: 3600,
  },
];

try {
  await client.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: corsRules } }));
  console.log(`✅ CORS configurado en el bucket ${bucket} (GET/HEAD/PUT desde cualquier origen).`);
  const check = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
  console.log(JSON.stringify(check.CORSRules, null, 2));
} catch (error) {
  console.error("❌ No se pudo configurar CORS:", error);
  process.exit(1);
}
