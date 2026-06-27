import { env } from "./env";

/**
 * Sube una imagen a Cloudinary usando el mismo preset sin firmar que ya
 * usa Vista360 — no necesita backend ni claves secretas, pero solo lo
 * usa la cuenta admin (los clientes nunca ven el botón de subir).
 */
export async function subirEvidenciaCloudinary(file: File): Promise<string> {
  const { cloudName, uploadPreset } = env.cloudinary;
  if (!cloudName || !uploadPreset) {
    throw new Error(
      "Cloudinary no está configurado (faltan VITE_CLOUDINARY_CLOUD_NAME / VITE_CLOUDINARY_UPLOAD_PRESET)."
    );
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);
  formData.append("folder", "vista360/campanas");

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error("No se pudo subir la imagen. Intenta de nuevo.");
  }

  const data = await res.json();
  return data.secure_url as string;
}
