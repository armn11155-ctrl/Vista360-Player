import { getAuth } from "firebase/auth";
import { app } from "./firebase";

/**
 * Sube una imagen o video a Cloudinary usando un unsigned upload preset.
 * Es el método más simple — no requiere Cloud Functions ni plan Blaze.
 * El cloud name y preset viajan en las variables de entorno VITE_* de
 * Cloudflare Pages (no son secretos críticos para una app con login).
 *
 * El botón de subir solo aparece para el admin, así que en la práctica
 * solo tú puedes llegar a esta función.
 */
export async function subirArchivoCloudinary(file: File, folder = "vista360/campanas"): Promise<string> {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error(
      "Cloudinary no está configurado. Agrega VITE_CLOUDINARY_CLOUD_NAME y VITE_CLOUDINARY_UPLOAD_PRESET en Cloudflare Pages."
    );
  }

  // Verificar que el usuario esté logueado antes de subir
  const auth = getAuth(app ?? undefined);
  if (!auth.currentUser) {
    throw new Error("Debes iniciar sesión para subir evidencias.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);
  formData.append("folder", folder);

  const resourceType = file.type.startsWith("video/") ? "video" : "image";
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    { method: "POST", body: formData }
  );

  if (!res.ok) {
    throw new Error("No se pudo subir el archivo. Intenta de nuevo.");
  }

  const data = await res.json();
  return data.secure_url as string;
}

export async function subirFacturaPdfCloudinary(file: File): Promise<string> {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error(
      "Cloudinary no está configurado. Agrega VITE_CLOUDINARY_CLOUD_NAME y VITE_CLOUDINARY_UPLOAD_PRESET en Cloudflare Pages."
    );
  }

  const auth = getAuth(app ?? undefined);
  if (!auth.currentUser) {
    throw new Error("Debes iniciar sesión para subir facturas.");
  }

  if (file.type !== "application/pdf") {
    throw new Error("Sube un PDF válido.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);
  formData.append("folder", "vista360/facturas");

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
    { method: "POST", body: formData }
  );

  if (!res.ok) {
    throw new Error("No se pudo subir la factura. Intenta de nuevo.");
  }

  const data = await res.json();
  return data.secure_url as string;
}

export async function subirEvidenciaCloudinary(file: File): Promise<string> {
  return subirArchivoCloudinary(file, "vista360/campanas");
}

export async function subirAvatarCloudinary(file: File): Promise<string> {
  return subirArchivoCloudinary(file, "vista360/avatares");
}
