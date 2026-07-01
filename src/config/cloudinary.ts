import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "./firebase";

/**
 * Sube una imagen a Cloudinary con una subida FIRMADA. Antes esta función
 * usaba un "unsigned upload preset" — funcionaba, pero el cloud name y el
 * preset viajan en el JS del navegador, así que cualquiera podía copiarlos
 * y subir archivos a la cuenta sin pasar por la app ni por ningún control
 * de rol. Ahora pedimos la firma a una Cloud Function (getCloudinarySignature)
 * que primero verifica en Firestore que quien llama es realmente el admin.
 * Sin firma válida, Cloudinary rechaza la subida — el control ya no depende
 * de que el botón esté oculto en la interfaz.
 *
 * Requiere desplegar la función `getCloudinarySignature` (ver /functions)
 * y configurar el secreto `CLOUDINARY_API_SECRET` + las variables de
 * entorno CLOUDINARY_API_KEY / CLOUDINARY_CLOUD_NAME del lado del servidor.
 */
export async function subirEvidenciaCloudinary(file: File): Promise<string> {
  const functions = getFunctions(app ?? undefined);
  const getSignature = httpsCallable<
    void,
    { timestamp: number; signature: string; apiKey: string; cloudName: string; folder: string }
  >(functions, "getCloudinarySignature");

  let firma;
  try {
    const res = await getSignature();
    firma = res.data;
  } catch (err) {
    // El backend distingue "no autenticado", "no eres admin" y "servidor mal
    // configurado" — se lo pasamos tal cual al usuario en vez de un genérico.
    const message =
      err instanceof Error ? err.message : "No se pudo autorizar la subida.";
    throw new Error(message);
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", firma.apiKey);
  formData.append("timestamp", String(firma.timestamp));
  formData.append("signature", firma.signature);
  formData.append("folder", firma.folder);

  // Cloudinary tiene endpoints de subida separados por tipo de recurso.
  // Antes esto siempre apuntaba a /image/upload — funcionaba para fotos,
  // pero Cloudinary rechaza un video en ese endpoint específico (hay que
  // usar /video/upload). La firma sigue siendo válida para ambos: firma
  // exactamente folder+timestamp, no el tipo de recurso.
  const resourceType = file.type.startsWith("video/") ? "video" : "image";
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${firma.cloudName}/${resourceType}/upload`,
    { method: "POST", body: formData }
  );

  if (!res.ok) {
    throw new Error("No se pudo subir el archivo. Intenta de nuevo.");
  }

  const data = await res.json();
  return data.secure_url as string;
}
